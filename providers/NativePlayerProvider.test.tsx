import { act, render } from "@testing-library/react-native";
import { Alert } from "react-native";
import type { NativePlayerEvents } from "@/modules/mpv-player";
import type { makeApi } from "@/test-utils/jellyfinApi";
import { stubReactNative } from "@/test-utils/reactNative";
import { NativePlayerProvider, useNativePlayer } from "./NativePlayerProvider";

jest.mock(
  "@/hooks/useNetworkStatus",
  () => jest.requireActual("@/test-utils/appProviders").networkStatusModule,
);

type MockListener = (payload: unknown) => void;
type MockConfig = { stream: { url: string } };

/**
 * The NativePlayer module, with the lifecycle of its iOS implementation
 * (NativePlayerModule.swift, NativePlayerSession.swift): presentPlayer is
 * refused while a session exists, load needs one, and a player that closes
 * emits onDismiss first and drops its session only once the cross-dissolve
 * has finished. Android drops it at the end of the main-thread pass that
 * emits onDismiss (NativePlayerSession.kt), once the engine has stopped,
 * which `finishClosing()` right after stands for.
 */
const mockNative = {
  session: null as { closing: boolean } | null,
  listeners: new Map<string, Set<MockListener>>(),
  /** Stream URL of every presentPlayer call, refused ones included. */
  presented: [] as string[],
  /** Stream URL of every load call. */
  loaded: [] as string[],
  /** Keeps presentPlayer pending, as the presentation animation does. */
  holdPresentation: false,
  pendingPresentations: [] as Array<() => void>,
  /**
   * presentPlayer rejects, as iOS does with no view controller to present
   * from. Held as well, the refusal arrives when the presentation is released.
   */
  refusePresentation: false,
  /** load rejects with the player still up, as a native throw mid-swap does. */
  refuseLoad: false,
  emit<K extends keyof NativePlayerEvents>(
    event: K,
    payload: Parameters<NativePlayerEvents[K]>[0],
  ) {
    for (const listener of this.listeners.get(event) ?? []) listener(payload);
  },
};

jest.mock("@/modules/mpv-player", () => {
  const done = async () => undefined;
  return {
    isNativePlayerModuleAvailable: () => true,
    isNativePlayerSyncPlayAvailable: () => false,
    isNativePlayerPresented: () => mockNative.session !== null,
    addNativePlayerListener: (event: string, listener: MockListener) => {
      const listeners = mockNative.listeners.get(event) ?? new Set();
      listeners.add(listener);
      mockNative.listeners.set(event, listeners);
      return { remove: () => listeners.delete(listener) };
    },
    presentNativePlayer: async (config: MockConfig) => {
      mockNative.presented.push(config.stream.url);
      if (mockNative.refusePresentation) {
        if (mockNative.holdPresentation) {
          await new Promise<void>((resolve) =>
            mockNative.pendingPresentations.push(resolve),
          );
        }
        throw new Error(
          "NoPresenterException: Could not find a view controller to present the native player from",
        );
      }
      if (mockNative.session) {
        throw new Error(
          "PlayerAlreadyPresentedException: A native player is already presented; call load() to swap the stream instead",
        );
      }
      mockNative.session = { closing: false };
      if (mockNative.holdPresentation) {
        await new Promise<void>((resolve) =>
          mockNative.pendingPresentations.push(resolve),
        );
      }
    },
    loadNativePlayerStream: async (config: MockConfig) => {
      mockNative.loaded.push(config.stream.url);
      if (mockNative.refuseLoad) throw new Error("load failed");
      if (!mockNative.session) {
        throw new Error(
          "NoActivePlayerException: No native player is currently presented",
        );
      }
    },
    dismissNativePlayer: async () => {
      if (!mockNative.session || mockNative.session.closing) return;
      mockNative.session.closing = true;
      mockNative.emit("onDismiss", {
        positionSec: 0,
        durationSec: 0,
        reason: "programmatic",
      });
      mockNative.session = null;
    },
    applyNativePlayerSyncPlayCommand: async () => false,
    cancelNativePlayerSyncPlayCommands: done,
    nativePlayerAddExternalSubtitle: done,
    nativePlayerDisableSubtitles: done,
    nativePlayerGetSubtitleTracks: async () => [],
    nativePlayerPause: done,
    nativePlayerPlay: done,
    nativePlayerSeekTo: done,
    nativePlayerSetAudioTrack: done,
    nativePlayerSetSpeed: done,
    nativePlayerSetSubtitleTrack: done,
    nativePlayerShowNotice: done,
    nativePlayerToggleMute: done,
    updateNativePlayerEpisodeList: done,
    updateNativePlayerNextEpisode: done,
    updateNativePlayerSegments: done,
    updateNativePlayerSubtitleSearch: done,
    updateNativePlayerSyncPlay: done,
    updateNativePlayerTrackMenus: done,
  };
});

/** PlaybackInfo round trips the spec holds back, and how many have run. */
const mockNegotiation = {
  held: false,
  waiting: [] as Array<() => void>,
  count: 0,
  /**
   * Each item negotiated from now on is a Live TV channel, whose stream opens
   * a live stream on the server.
   */
  live: false,
  /** Items the server gives no stream for. */
  failing: new Set<string>(),
};

// The warm negotiates the next episode in the background; its import chain
// reaches the custom-header store (MMKV), which this spec does not mount.
jest.mock("@/utils/nativePlayer/warmUpcomingSubtitles", () => ({
  warmUpcomingSubtitles: jest.fn(async () => true),
}));
// The prefetch module reaches expo-file-system; only the new-player clear is
// observed here.
jest.mock("@/utils/nativePlayer/externalSubtitles", () => ({
  clearSubtitlePrefetchCache: jest.fn(),
}));
jest.mock("@/utils/nativePlayer/buildNativePlayerConfig", () => ({
  buildNativePlayerStrings: () => ({}),
  buildTrackMenus: () => ({}),
  buildNativePlayerConfig: async ({
    req,
    item,
  }: {
    req: { itemId: string; bitrateValue?: number };
    item?: object;
  }) => {
    if (mockNegotiation.held) {
      await new Promise<void>((resolve) =>
        mockNegotiation.waiting.push(resolve),
      );
    }
    if (mockNegotiation.failing.has(req.itemId)) {
      throw new Error("PlaybackInfo returned no media source");
    }
    mockNegotiation.count += 1;
    const playSessionId = `play-session-${mockNegotiation.count}`;
    const url = `https://jellyfin.example.com/Videos/${req.itemId}/stream?PlaySessionId=${playSessionId}`;
    return {
      config: { stream: { url, autoplay: true } },
      seed: {
        item: item ?? {
          Id: req.itemId,
          Name: req.itemId,
          ...(mockNegotiation.live
            ? { Type: "TvChannel" }
            : { Type: "Episode", SeriesId: "series-1" }),
        },
        offline: false,
        downloadedItem: null,
        stream: {
          url,
          sessionId: playSessionId,
          mediaSource: {
            Id: `source-${req.itemId}`,
            ...(mockNegotiation.live && {
              LiveStreamId: `live-${playSessionId}`,
            }),
          },
        },
        mediaSourceId: `source-${req.itemId}`,
        bitrateValue: req.bitrateValue,
        subtitleIndex: -1,
        startTicks: 0,
        playMethod: "DirectPlay",
      },
    };
  },
}));

const mockNextEpisode = {
  Id: "item-2",
  Name: "Episode 2",
  Type: "Episode",
  SeriesId: "series-1",
  ParentIndexNumber: 1,
  IndexNumber: 2,
};
const mockPlayback = {
  saveLocalPlaybackProgress: () => undefined,
  reportRemotePlaybackProgress: async () => undefined,
  nextItem: mockNextEpisode,
  previousItem: null,
};
const mockSettings = {};
let mockEngine: "mpv" | "exoplayer" = "mpv";
let mockPlayerSupported = true;
const mockDefaultPlaySettings = jest.fn(
  (item: { Id?: string }, ..._rest: unknown[]) => ({
    mediaSource: { Id: `source-${item.Id}` },
    audioIndex: undefined as number | undefined,
    subtitleIndex: -1,
  }),
);
const mockUpdateSettings = () => undefined;
const mockT = (key: string) => key;
const mockNoop = () => undefined;
const mockSocket = {
  handlers: new Map<string, Set<MockListener>>(),
  subscribe: (type: string, handler: MockListener) => {
    const handlers = mockSocket.handlers.get(type) ?? new Set();
    handlers.add(handler);
    mockSocket.handlers.set(type, handlers);
    return () => {
      handlers.delete(handler);
    };
  },
  retainInBackground: () => mockNoop,
  /** A message from the server, handed to its subscribers as the socket does. */
  receive: (type: string, data: unknown) => {
    for (const handler of mockSocket.handlers.get(type) ?? []) handler(data);
  },
};
const mockSyncPlay = {
  enabled: false,
  watching: false,
  group: null,
  playlist: [],
  error: null,
  resolveVideos: async () => [],
  registerPlayer: () => mockNoop,
  notifyBuffering: mockNoop,
};
const mockDownloads = {
  getDownloadedItemById: () => undefined,
  getDownloadedItems: () => [],
};
const mockOrientation = {
  lockOrientation: mockNoop,
  unlockOrientation: mockNoop,
};

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: mockT }),
}));
jest.mock("react-native-edge-to-edge", () => ({ SystemBars: () => null }));
jest.mock("@/packages/expo-screen-orientation", () => ({
  OrientationLock: { PORTRAIT_UP: 1, LANDSCAPE: 5 },
}));
jest.mock(
  "@/providers/JellyfinProvider",
  () =>
    jest.requireActual("@/test-utils/jellyfinProvider").jellyfinProviderModule,
);
jest.mock("@/providers/DownloadProvider", () => ({
  useDownload: () => mockDownloads,
}));
jest.mock("@/providers/SyncPlayProvider", () => ({
  useSyncPlay: () => mockSyncPlay,
}));
jest.mock("@/providers/WebSocketProvider", () => ({
  useWebSocketContext: () => mockSocket,
}));
jest.mock("@/hooks/useOrientation", () => ({
  useOrientation: () => mockOrientation,
}));
jest.mock("@/hooks/usePlaybackManager", () => ({
  usePlaybackManager: () => mockPlayback,
}));
jest.mock("@/hooks/useRemoteSubtitles", () => ({
  useRemoteSubtitles: () => ({
    searchAsync: async () => [],
    downloadAsync: async () => ({}),
    hasOpenSubtitlesApiKey: false,
  }),
}));
jest.mock("@/hooks/useRevalidatePlaybackProgressCache", () => ({
  useInvalidatePlaybackProgressCache: () => mockNoop,
}));
jest.mock("@/hooks/useServerVersion", () => ({
  useServerVersion: () => "10.11.0",
}));
jest.mock("@/utils/atoms/settings", () => ({
  get isPlayerSupported() {
    return mockPlayerSupported;
  },
  // The next-episode warm runs for ExoPlayer only and builds the device
  // profile from the engine.
  getActivePlayerType: () => mockEngine,
  useSettings: () => ({
    settings: mockSettings,
    updateSettings: mockUpdateSettings,
    pluginSettings: undefined,
  }),
}));
jest.mock("@/utils/jellyfin/getDefaultPlaySettings", () => ({
  getDefaultPlaySettings: (...args: [{ Id?: string }, ...unknown[]]) =>
    mockDefaultPlaySettings(...args),
  getAdjacentStartTicks: () => undefined,
}));
jest.mock("@/utils/jellyfin/image/getPrimaryImageUrl", () => ({
  getPrimaryImageUrl: () => null,
}));
jest.mock("@/utils/segments", () => {
  const none = {
    introSegments: [],
    creditSegments: [],
    recapSegments: [],
    commercialSegments: [],
    previewSegments: [],
  };
  return {
    fetchAndParseSegments: async () => none,
    getSegmentsForItem: () => none,
  };
});
jest.mock("@/utils/seriesTrackMemory", () => ({
  rememberSeriesTrack: () => undefined,
}));
jest.mock("@/utils/stillWatching", () => ({
  decideStillWatchingOnce: () => false,
  isStillWatchingDueAtEnd: () => false,
  recordStillWatchingAutoplay: () => undefined,
  resetStillWatchingSession: () => undefined,
  revertStillWatchingAutoplay: () => undefined,
}));
jest.mock("@/utils/syncplay/queueDisplay", () => ({
  syncPlayQueuePosterUrl: () => undefined,
  syncPlayQueueSubtitle: () => undefined,
}));

const api: ReturnType<typeof makeApi> = jest.requireMock(
  "@/providers/JellyfinProvider",
).apiAtom.init;
const log: { logAndCaptureError: jest.Mock } = jest.requireMock("@/utils/log");
const { warmUpcomingSubtitles }: { warmUpcomingSubtitles: jest.Mock } =
  jest.requireMock("@/utils/nativePlayer/warmUpcomingSubtitles");
const {
  clearSubtitlePrefetchCache,
}: { clearSubtitlePrefetchCache: jest.Mock } = jest.requireMock(
  "@/utils/nativePlayer/externalSubtitles",
);

const REPORTS: Record<string, string> = {
  "https://jellyfin.example.com/Sessions/Playing": "start",
  "https://jellyfin.example.com/Sessions/Playing/Stopped": "stop",
};

/** Start and stop reports the server received, in order: "start <PlaySessionId>". */
const serverReports = () =>
  api.mock.history.post.flatMap((request) => {
    const kind = REPORTS[request.url ?? ""];
    return kind ? [`${kind} ${JSON.parse(request.data).PlaySessionId}`] : [];
  });

/** Lets the promise chains started by the last action run out. */
const settle = async () => {
  for (let i = 0; i < 20; i++) {
    await act(async () => {});
  }
};

let player: ReturnType<typeof useNativePlayer>;
const Probe = () => {
  player = useNativePlayer();
  return null;
};

const mount = async () => {
  await render(
    <NativePlayerProvider>
      <Probe />
    </NativePlayerProvider>,
  );
  await settle();
};

const play = (itemId: string) =>
  player.presentFromRequest({ itemId, offline: false });

/** A play the viewer asked for, here or from another client. */
const playForViewer = (itemId: string) =>
  player.presentFromRequest(
    { itemId, offline: false },
    { alertOnFailure: true },
  );

/** Opens the player on an item and lets its stream load. */
const open = async (itemId: string) => {
  await act(async () => {
    await play(itemId);
  });
  await settle();
  await act(async () =>
    mockNative.emit("onLoad", {
      url: mockNative.presented[mockNative.presented.length - 1],
    }),
  );
};

/** Holds every stream negotiation that starts from now on. */
const holdNegotiations = () => {
  mockNegotiation.held = true;
};

const releaseNegotiations = async () => {
  mockNegotiation.held = false;
  const waiting = mockNegotiation.waiting.splice(0);
  await act(async () => {
    for (const release of waiting) release();
  });
  await settle();
};

/**
 * The player closing on its own, by its close button unless told otherwise:
 * onDismiss goes out while the module still holds its session.
 */
const startClosing = async (
  reason: "closeButton" | "playbackEnded" = "closeButton",
) => {
  if (mockNative.session) mockNative.session.closing = true;
  await act(async () =>
    mockNative.emit("onDismiss", {
      positionSec: 60,
      durationSec: 1800,
      reason,
    }),
  );
  await settle();
};

/** The dismissal is over: the cross-dissolve on iOS, the same pass on Android. */
const finishClosing = () => {
  mockNative.session = null;
};

/** Lets a play waiting for a closing player see it gone, in real time. */
const waitForClosedPlayer = () =>
  act(() => new Promise((resolve) => setTimeout(resolve, 150)));

/** The live streams the app asked the server to close. */
const closedLiveStreams = () =>
  api.mock.history.post.flatMap((request) => {
    const match = /\/LiveStreams\/Close\?liveStreamId=([^&]+)/.exec(
      request.url ?? "",
    );
    return match ? [match[1]] : [];
  });

/**
 * Starts a request and lets it run up to whatever holds it. Wrapped: an async
 * function returning the pending promise would wait for it instead.
 */
const start = async (request: () => Promise<unknown>) => {
  const started: { done: Promise<unknown> } = { done: Promise.resolve() };
  await act(async () => {
    started.done = request();
  });
  return started;
};

let alert: jest.SpyInstance;

beforeEach(() => {
  stubReactNative();
  alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  mockNative.session = null;
  mockNative.listeners.clear();
  mockNative.presented = [];
  mockNative.loaded = [];
  mockNative.holdPresentation = false;
  mockNative.pendingPresentations = [];
  mockNative.refusePresentation = false;
  mockNative.refuseLoad = false;
  mockNegotiation.held = false;
  mockNegotiation.waiting = [];
  mockNegotiation.count = 0;
  mockNegotiation.live = false;
  mockNegotiation.failing.clear();
  mockSocket.handlers.clear();
  mockPlayerSupported = true;
  api.mock.reset();
  api.mock.onAny().reply(200, {});
  log.logAndCaptureError.mockClear();
  mockEngine = "mpv";
  mockDefaultPlaySettings.mockClear();
  warmUpcomingSubtitles.mockClear();
  warmUpcomingSubtitles.mockImplementation(async () => true);
  clearSubtitlePrefetchCache.mockClear();
});

afterEach(() => {
  alert.mockRestore();
});

// Sentry REACT-NATIVE-BR: every event carried replace: true, so each was a
// swap whose player went away while its stream was negotiating. The swap
// fell through to a fresh present(), which iOS refuses while the closing
// player is still fading out.
describe("a swap the player closes under", () => {
  const swaps: Array<[string, () => Promise<unknown>]> = [
    // A same-item re-negotiation: PlaybackInfo with no item fetch before it.
    [
      "a quality change",
      async () =>
        mockNative.emit("onQualitySelected", {
          bitrateValue: 4_000_000,
          positionSec: 60,
        }),
    ],
    // An episode change: the next item is fetched, then negotiated.
    [
      "the next episode",
      async () =>
        mockNative.emit("onNextEpisodeRequested", {
          reason: "userTap",
          positionSec: 60,
        }),
    ],
    // A remote Play, a SyncPlay launch: a request from outside the player.
    ["a play request", () => play("item-3")],
  ];

  test.each(swaps)(
    "%s does not present a second player while the first is closing",
    async (_name, request) => {
      await mount();
      await open("item-1");
      holdNegotiations();
      const swap = await start(request);

      await startClosing();
      await releaseNegotiations();
      await act(async () => {
        await swap.done;
      });

      // The Sentry event: "NativePlayer present/load failed", replace: true.
      expect(log.logAndCaptureError).not.toHaveBeenCalled();
      expect(mockNative.presented).toHaveLength(1);
      // Nor a load into the player that is on its way out.
      expect(mockNative.loaded).toHaveLength(0);
    },
  );

  // Android drops its session right after emitting onDismiss, iOS once the
  // fade is over: presenting then succeeds, and the closed player reopens.
  test("a play request does not reopen a player that has finished closing", async () => {
    await mount();
    await open("item-1");
    holdNegotiations();
    const swap = await start(() => play("item-3"));

    await startClosing();
    finishClosing();
    await releaseNegotiations();

    // Handled: nothing failed for the item the user just closed.
    await expect(swap.done).resolves.toBe(true);
    expect(mockNative.presented).toHaveLength(1);
    // Nothing started on the server for the dropped stream.
    expect(serverReports()).toEqual([
      "start play-session-1",
      "stop play-session-1",
    ]);

    // And nothing is left behind: the next play opens the player.
    await act(async () => {
      await expect(play("item-4")).resolves.toBe(true);
    });
    await settle();
    expect(mockNative.presented).toHaveLength(2);
    expect(serverReports()).toEqual([
      "start play-session-1",
      "stop play-session-1",
      "start play-session-3",
    ]);
  });

  // The swap's stream negotiated from the server: dropping it closes it.
  test("a dropped swap closes the live stream it opened", async () => {
    await mount();
    await open("item-1");
    mockNegotiation.live = true;
    holdNegotiations();
    const swap = await start(async () =>
      mockNative.emit("onQualitySelected", {
        bitrateValue: 4_000_000,
        positionSec: 60,
      }),
    );

    await startClosing();
    await releaseNegotiations();
    await act(async () => {
      await swap.done;
    });

    expect(mockNative.loaded).toHaveLength(0);
    expect(closedLiveStreams()).toEqual(["live-play-session-2"]);
  });
});

// An episode change asked for in the last seconds, or a remote Play, races
// the end of the stream: the player closes on its own while the next item
// is negotiating. That item still plays, in a new player once the old one
// is gone.
describe("a swap whose stream ended under it", () => {
  test("plays the next episode in a new player", async () => {
    await mount();
    await open("item-1");
    holdNegotiations();
    const swap = await start(async () =>
      mockNative.emit("onNextEpisodeRequested", {
        reason: "userTap",
        positionSec: 1795,
      }),
    );

    await startClosing("playbackEnded");
    await releaseNegotiations();
    // Not while the closing player still holds the module, which iOS
    // refuses (Sentry REACT-NATIVE-BR).
    expect(mockNative.presented).toHaveLength(1);

    finishClosing();
    await waitForClosedPlayer();
    await act(async () => {
      await swap.done;
    });
    await settle();

    expect(mockNative.presented).toEqual([
      "https://jellyfin.example.com/Videos/item-1/stream?PlaySessionId=play-session-1",
      "https://jellyfin.example.com/Videos/item-2/stream?PlaySessionId=play-session-2",
    ]);
    expect(log.logAndCaptureError).not.toHaveBeenCalled();
    expect(serverReports()).toEqual([
      "start play-session-1",
      "stop play-session-1",
      "start play-session-2",
    ]);
  });

  // The same item has nothing left to play once its stream has ended.
  test("drops a quality change", async () => {
    await mount();
    await open("item-1");
    holdNegotiations();
    const swap = await start(async () =>
      mockNative.emit("onQualitySelected", {
        bitrateValue: 4_000_000,
        positionSec: 1795,
      }),
    );

    await startClosing("playbackEnded");
    finishClosing();
    await releaseNegotiations();
    await act(async () => {
      await swap.done;
    });

    expect(mockNative.presented).toHaveLength(1);
    expect(mockNative.loaded).toHaveLength(0);
    expect(log.logAndCaptureError).not.toHaveBeenCalled();
  });
});

describe("a play while the player is up", () => {
  test("swaps the stream in place while the player is in picture in picture", async () => {
    await mount();
    await open("item-1");
    await act(async () =>
      mockNative.emit("onPictureInPictureChange", { isActive: true }),
    );

    await act(async () => {
      await expect(play("item-3")).resolves.toBe(true);
    });
    await settle();

    expect(mockNative.presented).toHaveLength(1);
    expect(mockNative.loaded).toEqual([
      "https://jellyfin.example.com/Videos/item-3/stream?PlaySessionId=play-session-2",
    ]);
    // The outgoing session is closed on the server before the new one starts.
    expect(serverReports()).toEqual([
      "start play-session-1",
      "stop play-session-1",
      "start play-session-2",
    ]);
  });

  test("swaps into the first player while its presentation is still running", async () => {
    await mount();
    mockNative.holdPresentation = true;
    const first = await start(() => play("item-1"));
    await settle();

    await act(async () => {
      await expect(play("item-3")).resolves.toBe(true);
    });
    await settle();
    await act(async () => {
      for (const release of mockNative.pendingPresentations) release();
    });
    await act(async () => {
      await first.done;
    });
    await settle();

    expect(mockNative.presented).toHaveLength(1);
    expect(mockNative.loaded).toHaveLength(1);
    // The first stream never took the player, so it never started.
    expect(serverReports()).toEqual(["start play-session-2"]);
  });
});

// An episode picked in the player's list is fetched before it plays. The
// player can close, and another item start, while that fetch is out.
describe("an episode picked while its item is still being fetched", () => {
  const ITEM_2 = { Id: "item-2", Name: "Episode 2", Type: "Episode" };

  /** Holds the item fetch the episode list starts, until `answer()`. */
  const holdItemFetch = () => {
    let answer = () => {};
    const held = new Promise<void>((resolve) => {
      answer = resolve;
    });
    api.mock.resetHandlers();
    api.mock.onGet(/\/Items\/item-2/).reply(async () => {
      await held;
      return [200, ITEM_2];
    });
    api.mock.onAny().reply(200, {});
    return async () => {
      await act(async () => answer());
      await settle();
    };
  };

  test("is not played into the next item's player", async () => {
    await mount();
    await open("item-1");
    const answerFetch = holdItemFetch();
    await act(async () =>
      mockNative.emit("onEpisodeSelected", {
        itemId: "item-2",
        positionSec: 60,
      }),
    );

    await startClosing();
    finishClosing();
    await open("item-3");
    await answerFetch();

    // Nothing loaded into item-3's player, and its session left running.
    expect(mockNative.loaded).toHaveLength(0);
    expect(serverReports()).toEqual([
      "start play-session-1",
      "stop play-session-1",
      "start play-session-2",
    ]);
  });

  test("still plays once the stream it was picked from has ended", async () => {
    await mount();
    await open("item-1");
    const answerFetch = holdItemFetch();
    await act(async () =>
      mockNative.emit("onEpisodeSelected", {
        itemId: "item-2",
        positionSec: 1795,
      }),
    );

    await startClosing("playbackEnded");
    finishClosing();
    await answerFetch();

    expect(mockNative.presented).toEqual([
      "https://jellyfin.example.com/Videos/item-1/stream?PlaySessionId=play-session-1",
      "https://jellyfin.example.com/Videos/item-2/stream?PlaySessionId=play-session-2",
    ]);
    expect(log.logAndCaptureError).not.toHaveBeenCalled();
  });
});

// The user closes the player and starts another item right away, or another
// client sends Play: the request finds no session, but on iOS the module
// still holds the closing one until its fade-out ends.
test("a play waits for a player that is still closing", async () => {
  await mount();
  await open("item-1");
  await startClosing();

  const played = await start(() => play("item-3"));
  await settle();
  expect(mockNative.presented).toHaveLength(1);

  finishClosing();
  await waitForClosedPlayer();
  await act(async () => {
    await expect(played.done).resolves.toBe(true);
  });
  await settle();

  expect(mockNative.presented).toHaveLength(2);
  expect(log.logAndCaptureError).not.toHaveBeenCalled();
});

// Only ExoPlayer waits on its sidecars before a load (buildNativePlayerConfig),
// so only it has a next-episode wait for the warm to take off.
describe("the next episode's subtitle warm", () => {
  test("negotiates the next episode as the swap will, on ExoPlayer", async () => {
    mockEngine = "exoplayer";
    await mount();
    await act(async () => {
      await player.presentFromRequest({
        itemId: "item-1",
        offline: false,
        bitrateValue: 8_000_000,
      });
    });
    await settle();

    expect(warmUpcomingSubtitles).toHaveBeenCalledTimes(1);
    expect(warmUpcomingSubtitles.mock.calls[0]?.[0]).toMatchObject({
      item: { Id: "item-2" },
      mediaSourceId: "source-item-2",
      subtitleStreamIndex: -1,
      maxStreamingBitrate: 8_000_000,
    });
    // Resolved as playAdjacentItem resolves the swap: from the playing
    // source, with the session's tracks carried.
    expect(mockDefaultPlaySettings).toHaveBeenCalledWith(
      expect.objectContaining({ Id: "item-2" }),
      mockSettings,
      expect.objectContaining({
        source: expect.objectContaining({ Id: "source-item-1" }),
        indexes: { subtitleIndex: -1, audioIndex: undefined },
      }),
    );
  });

  test("leaves mpv to fetch its sidecars itself", async () => {
    await mount();
    await open("item-1");

    expect(warmUpcomingSubtitles).not.toHaveBeenCalled();
  });

  // A sidecar re-synced on the server keeps its cache name: only the warm to
  // swap hand-off inside one player may reuse a cached file.
  test("a new player empties the subtitle cache and warms its next item again", async () => {
    mockEngine = "exoplayer";
    await mount();
    await open("item-1");
    expect(clearSubtitlePrefetchCache).toHaveBeenCalledTimes(1);
    expect(warmUpcomingSubtitles).toHaveBeenCalledTimes(1);

    await startClosing();
    finishClosing();
    await waitForClosedPlayer();
    await open("item-1");

    expect(clearSubtitlePrefetchCache).toHaveBeenCalledTimes(2);
    expect(warmUpcomingSubtitles).toHaveBeenCalledTimes(2);
  });

  test("a warm that left a sidecar off disk is tried again", async () => {
    mockEngine = "exoplayer";
    warmUpcomingSubtitles.mockImplementationOnce(async () => false);
    await mount();
    await open("item-1");
    expect(warmUpcomingSubtitles).toHaveBeenCalledTimes(1);

    // A same-item renegotiation pushes the next-episode payload again.
    await act(async () =>
      mockNative.emit("onQualitySelected", {
        bitrateValue: 4_000_000,
        positionSec: 60,
      }),
    );
    await settle();
    await act(async () =>
      mockNative.emit("onLoad", {
        url: mockNative.loaded[mockNative.loaded.length - 1],
      }),
    );
    await settle();

    expect(warmUpcomingSubtitles).toHaveBeenCalledTimes(2);
  });
});

// This is the only player. A play that leaves the viewer with none says why;
// one that lost to something newer, or to an item still playing, does not.
describe("a play the player cannot start", () => {
  test("says the server gave no stream", async () => {
    await mount();
    mockNegotiation.failing.add("item-1");

    await act(async () => {
      await expect(playForViewer("item-1")).resolves.toBe(false);
    });

    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert).toHaveBeenCalledWith(
      "player.error",
      "player.failed_to_get_stream_url",
    );
    expect(mockNative.presented).toHaveLength(0);
  });

  test("says the player did not open, and opens on the next play", async () => {
    await mount();
    mockNative.refusePresentation = true;

    await act(async () => {
      await expect(playForViewer("item-1")).resolves.toBe(false);
    });
    await settle();

    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert).toHaveBeenCalledWith(
      "player.error",
      "player.an_error_occurred_while_playing_the_video",
    );
    // The refused stream never started on the server.
    expect(serverReports()).toEqual([]);

    mockNative.refusePresentation = false;
    await act(async () => {
      await expect(playForViewer("item-1")).resolves.toBe(true);
    });
    await settle();

    expect(mockNative.session).not.toBeNull();
    expect(serverReports()).toEqual(["start play-session-2"]);
  });

  // The swap closed the outgoing session on the server and left the player
  // in an unknown state, so the provider closes it: the viewer is left with
  // no player at all.
  test("says why when a failed swap closes the player", async () => {
    await mount();
    await open("item-1");
    mockNative.refuseLoad = true;

    await act(async () => {
      await expect(playForViewer("item-3")).resolves.toBe(false);
    });
    await settle();

    expect(mockNative.session).toBeNull();
    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert).toHaveBeenCalledWith(
      "player.error",
      "player.an_error_occurred_while_playing_the_video",
    );
  });

  // Picked in the player itself: the viewer asked for it as surely as for a
  // play from a detail page.
  test.each([
    [
      "a quality change",
      async () =>
        mockNative.emit("onQualitySelected", {
          bitrateValue: 4_000_000,
          positionSec: 60,
        }),
    ],
    [
      "the next episode",
      async () =>
        mockNative.emit("onNextEpisodeRequested", {
          reason: "userTap",
          positionSec: 60,
        }),
    ],
  ])("says why when %s closes the player", async (_name, request) => {
    await mount();
    await open("item-1");
    mockNative.refuseLoad = true;

    await act(request);
    await settle();

    expect(mockNative.loaded).toHaveLength(1);
    expect(mockNative.session).toBeNull();
    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert).toHaveBeenCalledWith(
      "player.error",
      "player.an_error_occurred_while_playing_the_video",
    );
  });

  test("leaves a failed swap to a caller that did not ask to be told", async () => {
    await mount();
    await open("item-1");
    mockNative.refuseLoad = true;

    await act(async () => {
      await expect(play("item-3")).resolves.toBe(false);
    });
    await settle();

    expect(mockNative.session).toBeNull();
    expect(alert).not.toHaveBeenCalled();
  });

  test("says so for a play another client sent", async () => {
    await mount();
    mockNegotiation.failing.add("item-1");

    await act(async () => mockSocket.receive("Play", { ItemIds: ["item-1"] }));
    await settle();

    expect(alert).toHaveBeenCalledWith(
      "player.error",
      "player.failed_to_get_stream_url",
    );
  });

  // A SyncPlay launch reports its own failure to the group.
  test("leaves the telling to a caller that did not ask for it", async () => {
    await mount();
    mockNegotiation.failing.add("item-1");

    await act(async () => {
      await expect(play("item-1")).resolves.toBe(false);
    });

    expect(alert).not.toHaveBeenCalled();
  });

  test("stays quiet when a newer play took its place", async () => {
    await mount();
    mockNegotiation.failing.add("item-1");
    holdNegotiations();
    const first = await start(() => playForViewer("item-1"));
    const second = await start(() => playForViewer("item-3"));

    await releaseNegotiations();
    await act(async () => {
      await expect(first.done).resolves.toBe(false);
      await expect(second.done).resolves.toBe(true);
    });
    await settle();

    expect(alert).not.toHaveBeenCalled();
    expect(mockNative.presented).toEqual([
      "https://jellyfin.example.com/Videos/item-3/stream?PlaySessionId=play-session-1",
    ]);
  });

  // The refusal comes back from the native side after the call, and by then
  // the viewer may have asked for something else.
  test("stays quiet when its player is refused after a newer play started", async () => {
    await mount();
    mockNative.holdPresentation = true;
    mockNative.refusePresentation = true;
    const first = await start(() => playForViewer("item-1"));
    await settle();
    mockNative.holdPresentation = false;
    mockNative.refusePresentation = false;
    holdNegotiations();
    const second = await start(() => playForViewer("item-3"));
    await settle();

    await act(async () => {
      for (const refuse of mockNative.pendingPresentations.splice(0)) refuse();
    });
    await act(async () => {
      await expect(first.done).resolves.toBe(false);
    });
    await releaseNegotiations();
    await act(async () => {
      await expect(second.done).resolves.toBe(true);
    });
    await settle();

    expect(alert).not.toHaveBeenCalled();
    expect(mockNative.session).not.toBeNull();
    expect(serverReports()).toEqual(["start play-session-2"]);
  });

  // In picture in picture the viewer can start another item. When that one
  // has no stream, the one playing goes on, and its session stays open.
  test("stays quiet when the item on screen keeps playing", async () => {
    await mount();
    await open("item-1");
    mockNegotiation.failing.add("item-3");

    await act(async () => {
      await expect(playForViewer("item-3")).resolves.toBe(false);
    });
    await settle();

    expect(alert).not.toHaveBeenCalled();
    expect(mockNative.session).not.toBeNull();
    expect(mockNative.loaded).toHaveLength(0);
    expect(serverReports()).toEqual(["start play-session-1"]);
  });
});

// An Apple TV below tvOS 26: the TV chrome needs 26, and nothing else plays.
describe("on a device the player does not run on", () => {
  beforeEach(() => {
    mockPlayerSupported = false;
  });

  test("a play says what the device needs, and asks the server for nothing", async () => {
    await mount();

    await act(async () => {
      await expect(playForViewer("item-1")).resolves.toBe(false);
    });

    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert).toHaveBeenCalledWith(
      "player.error",
      "player.requires_tvos_26",
    );
    expect(mockNegotiation.count).toBe(0);
    expect(mockNative.presented).toHaveLength(0);
  });

  test("so does a play another client sent", async () => {
    await mount();

    await act(async () => mockSocket.receive("Play", { ItemIds: ["item-1"] }));

    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert).toHaveBeenCalledWith(
      "player.error",
      "player.requires_tvos_26",
    );
  });

  test("a play that reports its own failure is only refused", async () => {
    await mount();

    await act(async () => {
      await expect(play("item-1")).resolves.toBe(false);
    });

    expect(alert).not.toHaveBeenCalled();
  });
});

// The server shares a channel's stream between everyone watching it, counts
// one reference per negotiation, and closes the stream when the count reaches
// zero: a session that gives its reference back twice cuts the stream from
// under the others, another device on the channel or the swap's new stream.
describe("a Live TV stream", () => {
  /**
   * Each request that gives a live stream reference back: a close, and a stop
   * report that names the stream, which Jellyfin closes as well when no
   * session reported watching it.
   */
  const liveStreamReleases = () =>
    api.mock.history.post.flatMap((request) => {
      const url = request.url ?? "";
      const close = /\/LiveStreams\/Close\?liveStreamId=([^&]+)/.exec(url);
      if (close) return [close[1]];
      if (url !== "https://jellyfin.example.com/Sessions/Playing/Stopped") {
        return [];
      }
      const named = JSON.parse(request.data).LiveStreamId;
      return named ? [named] : [];
    });

  test("is given back once when the player closes", async () => {
    await mount();
    mockNegotiation.live = true;
    await open("item-1");

    await startClosing();
    finishClosing();
    await settle();

    expect(serverReports()).toEqual([
      "start play-session-1",
      "stop play-session-1",
    ]);
    expect(liveStreamReleases()).toEqual(["live-play-session-1"]);
  });

  test("is given back once when a track or bitrate change swaps it", async () => {
    await mount();
    mockNegotiation.live = true;
    await open("item-1");

    await act(async () =>
      mockNative.emit("onQualitySelected", {
        bitrateValue: 4_000_000,
        positionSec: 60,
      }),
    );
    await settle();

    expect(mockNative.loaded).toHaveLength(1);
    expect(liveStreamReleases()).toEqual(["live-play-session-1"]);
  });

  /** Holds every stop report until the returned release is called. */
  const holdStopReports = () => {
    const pending: Array<() => void> = [];
    api.mock.resetHandlers();
    api.mock
      .onPost("https://jellyfin.example.com/Sessions/Playing/Stopped")
      .reply(
        () =>
          new Promise((resolve) => {
            pending.push(() => resolve([200, {}]));
          }),
      );
    api.mock.onAny().reply(200, {});
    return async () => {
      await act(async () => {
        for (const release of pending.splice(0)) release();
      });
      await settle();
    };
  };

  const pickQuality = async (bitrateValue: number) => {
    await act(async () =>
      mockNative.emit("onQualitySelected", { bitrateValue, positionSec: 60 }),
    );
    await settle();
  };

  // The second pick swaps the channel out while the first still waits for
  // the stop report of the stream both of them replace.
  test("is given back once when a second quality pick lands during a swap", async () => {
    await mount();
    mockNegotiation.live = true;
    await open("item-1");
    const releaseStops = holdStopReports();

    await pickQuality(4_000_000);
    await pickQuality(2_000_000);
    await releaseStops();

    expect(mockNative.loaded).toEqual([
      expect.stringContaining("PlaySessionId=play-session-3"),
    ]);
    // The first pick's stream never played; the second pick's plays on.
    expect(liveStreamReleases().sort()).toEqual([
      "live-play-session-1",
      "live-play-session-2",
    ]);
  });

  test("is given back once when the player closes during a swap", async () => {
    await mount();
    mockNegotiation.live = true;
    await open("item-1");
    const releaseStops = holdStopReports();

    await pickQuality(4_000_000);
    await startClosing();
    finishClosing();
    await releaseStops();

    expect(mockNative.loaded).toEqual([]);
    expect(liveStreamReleases().sort()).toEqual([
      "live-play-session-1",
      "live-play-session-2",
    ]);
  });

  test("is given back once when a failed swap closes the player", async () => {
    await mount();
    mockNegotiation.live = true;
    await open("item-1");
    mockNative.refuseLoad = true;

    await pickQuality(4_000_000);

    expect(mockNative.session).toBeNull();
    expect(liveStreamReleases().sort()).toEqual([
      "live-play-session-1",
      "live-play-session-2",
    ]);
  });

  // Other devices offer a seek bar on a session the server says can seek,
  // and a seek sent to a channel goes nowhere.
  test("is reported as one that cannot seek", async () => {
    await mount();
    mockNegotiation.live = true;
    await open("item-1");

    const canSeek = api.mock.history.post
      .filter(
        (request) =>
          request.url === "https://jellyfin.example.com/Sessions/Playing",
      )
      .map((request) => JSON.parse(request.data).CanSeek);
    expect(canSeek).toEqual([false]);
  });
});
