import { act, render } from "@testing-library/react-native";
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
  /** What each build was asked for, in order. */
  params: [] as Array<{
    maxStreamingBitrate?: { value?: number };
    linkInUse?: boolean;
  }>,
  /** Each stream negotiated from now on opens a live stream on the server. */
  live: false,
  /**
   * The id every live negotiation gets, as Jellyfin answers for a shared
   * channel; unset, each negotiation gets its own.
   */
  sharedLiveStreamId: null as string | null,
  /** The file's bitrate the negotiated streams carry, when a spec sets one. */
  bitrate: undefined as number | undefined,
  /** Items whose stream negotiation fails. */
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
  buildNativePlayerConfig: async (params: {
    req: { itemId: string; bitrateValue?: number };
    item?: object;
    maxStreamingBitrate?: { value?: number };
  }) => {
    const { req, item } = params;
    mockNegotiation.params.push(params);
    if (mockNegotiation.held) {
      await new Promise<void>((resolve) =>
        mockNegotiation.waiting.push(resolve),
      );
    }
    if (mockNegotiation.failing.has(req.itemId)) {
      throw new Error("PlaybackInfo failed");
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
          Type: "Episode",
          SeriesId: "series-1",
        },
        offline: false,
        downloadedItem: null,
        stream: {
          url,
          sessionId: playSessionId,
          mediaSource: {
            Id: `source-${req.itemId}`,
            ...(mockNegotiation.live && {
              LiveStreamId:
                mockNegotiation.sharedLiveStreamId ?? `live-${playSessionId}`,
            }),
            ...(mockNegotiation.bitrate && {
              Bitrate: mockNegotiation.bitrate,
            }),
          },
        },
        mediaSourceId: `source-${req.itemId}`,
        bitrateValue: req.bitrateValue,
        // The cap a swap asked for; otherwise a fixed quality caps the
        // stream at itself, and 12 Mb/s stands for what Auto, the default,
        // measures.
        maxStreamingBitrate: params.maxStreamingBitrate
          ? params.maxStreamingBitrate.value
          : typeof req.bitrateValue === "number"
            ? req.bitrateValue
            : 12_000_000,
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
/** While set, remote progress reports wait in it until the test answers. */
const mockRemoteProgress = { held: null as Array<() => void> | null };
const mockPlayback = {
  saveLocalPlaybackProgress: () => undefined,
  reportRemotePlaybackProgress: async () => {
    const held = mockRemoteProgress.held;
    if (held) await new Promise<void>((resolve) => held.push(resolve));
    return undefined;
  },
  nextItem: mockNextEpisode,
  previousItem: null,
};
const mockSettings: { autoBitrateAdapt?: boolean } = {};
let mockEngine: "mpv" | "exoplayer" = "mpv";
const mockDefaultPlaySettings = jest.fn(
  (item: { Id?: string }, ..._rest: unknown[]) => ({
    mediaSource: { Id: `source-${item.Id}` },
    audioIndex: undefined as number | undefined,
    subtitleIndex: -1,
  }),
);
const mockDetectBitrate = jest.fn();
const mockKeepPlaybackRate = jest.fn();
jest.mock("@/utils/jellyfin/bitrateTest", () => ({
  detectBitrate: (...args: unknown[]) => mockDetectBitrate(...args),
  keepPlaybackRate: (...args: unknown[]) => mockKeepPlaybackRate(...args),
}));
const mockUpdateSettings = () => undefined;
const mockT = (key: string) => key;
const mockNoop = () => undefined;
const mockSocket = {
  subscribe: () => mockNoop,
  clearLastMessage: mockNoop,
  retainInBackground: () => mockNoop,
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
// What useDownload returns: a new object re-runs the provider's listener
// effect, as a download state change does.
let mockDownloadUtils = mockDownloads;
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
  useDownload: () => mockDownloadUtils,
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
  isNativePlayerSupported: true,
  isNativePlayerSupportedTV: false,
  isNativePlayerSupportedAndroidTV: false,
  isNativeChromeActive: () => true,
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
const log: { logAndCaptureError: jest.Mock; writeToLog: jest.Mock } =
  jest.requireMock("@/utils/log");
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
  const view = await render(
    <NativePlayerProvider>
      <Probe />
    </NativePlayerProvider>,
  );
  await settle();
  return view;
};

const play = (itemId: string) =>
  player.presentFromRequest({ itemId, offline: false });

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

beforeEach(() => {
  stubReactNative();
  mockNative.session = null;
  mockNative.listeners.clear();
  mockNative.presented = [];
  mockNative.loaded = [];
  mockNative.holdPresentation = false;
  mockNative.pendingPresentations = [];
  mockNative.refuseLoad = false;
  mockNegotiation.held = false;
  mockNegotiation.waiting = [];
  mockNegotiation.count = 0;
  mockNegotiation.params = [];
  mockNegotiation.live = false;
  mockNegotiation.sharedLiveStreamId = null;
  mockRemoteProgress.held = null;
  mockNegotiation.bitrate = undefined;
  mockNegotiation.failing.clear();
  api.mock.reset();
  api.mock.onAny().reply(200, {});
  log.logAndCaptureError.mockClear();
  mockEngine = "mpv";
  mockDefaultPlaySettings.mockClear();
  warmUpcomingSubtitles.mockClear();
  warmUpcomingSubtitles.mockImplementation(async () => true);
  clearSubtitlePrefetchCache.mockClear();
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

    // Handled, so the caller does not open the JS player in its place.
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

// An audio track the stream does not carry needs another stream. Under Auto,
// an hour on, it measured the connection again with the old stream still
// downloading over it.
// Auto keeps the measure before while the stream it replaces still downloads,
// however old. Past that download, an episode change lets it measure again,
// or one measure would serve a whole queue.
describe("an episode change under Auto", () => {
  const progress = (position: number, cacheSeconds: number) =>
    act(async () =>
      mockNative.emit("onProgress", {
        position,
        duration: 1800,
        progress: 0,
        cacheSeconds,
      }),
    );
  const nextEpisode = async () => {
    await act(async () =>
      mockNative.emit("onNextEpisodeRequested", {
        reason: "userTap",
        positionSec: 1790,
      }),
    );
    await settle();
  };

  test("asks with the link in use while the stream played still downloads", async () => {
    await mount();
    await open("item-1");
    await progress(300, 30);

    await nextEpisode();

    expect(mockNegotiation.params).toHaveLength(2);
    expect(mockNegotiation.params[1].linkInUse).toBe(true);
  });

  test("leaves the link to the measure once the stream played is downloaded", async () => {
    await mount();
    await open("item-1");
    await progress(1780, 20);

    await nextEpisode();

    expect(mockNegotiation.params).toHaveLength(2);
    expect(mockNegotiation.params[1].linkInUse).toBe(false);
  });

  test("leaves the link to the measure once the stream played ended", async () => {
    await mount();
    await open("item-1");
    await act(async () =>
      mockNative.emit("onPlaybackEnded", { positionSec: 1800 }),
    );

    await nextEpisode();

    expect(mockNegotiation.params).toHaveLength(2);
    expect(mockNegotiation.params[1].linkInUse).toBe(false);
  });

  // A seek back puts the rest of the file to download again.
  test("asks with the link in use again after a seek back", async () => {
    await mount();
    await open("item-1");
    await progress(1780, 20);
    await progress(600, 30);

    await nextEpisode();

    expect(mockNegotiation.params[1].linkInUse).toBe(true);
  });
});

describe("a track change that needs another stream", () => {
  test("asks for it at the cap the stream plays at", async () => {
    await mount();
    await open("item-1");

    await act(async () =>
      mockNative.emit("onTrackSelectionRequested", {
        kind: "audio",
        jellyfinIndex: 2,
        positionSec: 30,
      }),
    );
    await settle();

    expect(mockNegotiation.params).toHaveLength(2);
    expect(mockNegotiation.params[1].maxStreamingBitrate).toEqual({
      value: 12_000_000,
    });
  });

  test("asks for a new quality without it", async () => {
    await mount();
    await open("item-1");

    await act(async () =>
      mockNative.emit("onQualitySelected", {
        bitrateValue: 4_000_000,
        positionSec: 30,
      }),
    );
    await settle();

    expect(mockNegotiation.params).toHaveLength(2);
    expect(mockNegotiation.params[1].maxStreamingBitrate).toBeUndefined();
  });

  // The stream it replaces still downloads over the link while Auto measures.
  test("asks for it as the link is in use, and the first stream without", async () => {
    await mount();
    await open("item-1");

    await act(async () =>
      mockNative.emit("onQualitySelected", {
        bitrateValue: 4_000_000,
        positionSec: 30,
      }),
    );
    await settle();

    expect(mockNegotiation.params).toHaveLength(2);
    expect(mockNegotiation.params[0].linkInUse).toBe(false);
    expect(mockNegotiation.params[1].linkInUse).toBe(true);
  });
});

// Two Play taps while Auto measures the connection: the first, overtaken
// before it took the player, said it declined, and its caller opened the JS
// player under the native one the second presented.
describe("a play overtaken before it took the player", () => {
  // Its caller would open the JS player under the native one the newer play
  // presents.
  test("whose stream fails is not a decline either", async () => {
    await mount();
    holdNegotiations();
    mockNegotiation.failing.add("item-1");
    const first = await start(() => play("item-1"));
    const second = await start(() => play("item-3"));

    await releaseNegotiations();

    await act(async () => {
      await expect(first.done).resolves.toBe(true);
      await expect(second.done).resolves.toBe(true);
    });
  });

  test("is not a decline, the newer one plays", async () => {
    await mount();
    holdNegotiations();
    const first = await start(() => play("item-1"));
    const second = await start(() => play("item-3"));

    await releaseNegotiations();

    await act(async () => {
      await expect(first.done).resolves.toBe(true);
      await expect(second.done).resolves.toBe(true);
    });
    await settle();
    expect(mockNative.presented).toEqual([
      expect.stringContaining("/Videos/item-3/"),
    ]);
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

describe("Auto during playback", () => {
  const playAt = async (bitrateValue: "auto" | number) => {
    await act(async () => {
      await player.presentFromRequest({
        itemId: "item-1",
        offline: false,
        bitrateValue,
      });
    });
    await settle();
    await loaded();
  };
  /** The latest stream loaded: a swap loads into the player on screen. */
  const loaded = () =>
    act(async () =>
      mockNative.emit("onLoad", {
        url: mockNative.loaded.at(-1) ?? mockNative.presented.at(-1) ?? "",
      }),
    );
  const playerState = (isLoading: boolean) =>
    act(async () =>
      mockNative.emit("onPlaybackStateChange", { isPlaying: true, isLoading }),
    );
  const wait = (ms: number) =>
    act(async () => {
      jest.advanceTimersByTime(ms);
    });
  /** Plays past the grace, then stalls for three seconds. */
  const stall = async () => {
    await playerState(false);
    await wait(6_000);
    await playerState(true);
    await wait(3_000);
    await settle();
  };

  beforeEach(() => {
    jest.useFakeTimers({ now: 1_000_000 });
    mockDetectBitrate.mockReset();
    mockKeepPlaybackRate.mockReset();
    log.writeToLog.mockClear();
    delete mockSettings.autoBitrateAdapt;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("asks for a lower stream when the one playing stalls, and keeps what it learned", async () => {
    await mount();
    await playAt("auto");

    await stall();

    expect(mockNegotiation.params).toHaveLength(2);
    expect(mockNegotiation.params[1].maxStreamingBitrate).toEqual({
      value: 8_000_000,
    });
    // Nothing read the link: the next playback starts at the lowered cap.
    expect(mockKeepPlaybackRate).toHaveBeenCalledWith(
      expect.anything(),
      8_000_000 / 0.7,
    );
    // The app's log says why the quality changed.
    expect(log.writeToLog).toHaveBeenCalledWith(
      "INFO",
      "Auto quality stepped down",
      expect.objectContaining({ from: 12_000_000, to: 8_000_000 }),
    );
  });

  // The link carried nothing: the cache emptied as fast as the file played.
  test("keeps the lowest cap, never nothing, when the link carried nothing", async () => {
    mockNegotiation.bitrate = 10_000_000;
    await mount();
    await playAt("auto");
    await playerState(false);
    await wait(6_000);
    for (let second = 0; second < 12; second++) {
      await act(async () =>
        mockNative.emit("onProgress", {
          position: 6 + Math.min(second, 8),
          duration: 1800,
          progress: 0,
          cacheSeconds: Math.max(0, 8 - second),
        }),
      );
      await wait(1_000);
    }
    await settle();

    expect(mockNegotiation.params[1].maxStreamingBitrate).toEqual({
      value: 250_000,
    });
    expect(mockKeepPlaybackRate).toHaveBeenCalledWith(
      expect.anything(),
      250_000 / 0.7,
    );
  });

  test("asks again after a while when the lower stream could not start", async () => {
    await mount();
    await playAt("auto");
    mockNegotiation.failing.add("item-1");

    await stall();
    expect(mockNegotiation.params).toHaveLength(2);
    mockNegotiation.failing.delete("item-1");
    await wait(33_000);
    await settle();

    expect(mockNegotiation.params).toHaveLength(3);
  });

  // The rate was kept before the lower stream was asked for: one that never
  // played left its cap to every later playback on that network.
  test("keeps nothing of a lower stream that could not start", async () => {
    await mount();
    await playAt("auto");
    mockNegotiation.failing.add("item-1");

    await stall();

    expect(mockNegotiation.params).toHaveLength(2);
    expect(mockKeepPlaybackRate).not.toHaveBeenCalled();
  });

  test("keeps nothing of a lower stream the player closed under", async () => {
    await mount();
    await playAt("auto");
    holdNegotiations();
    await stall();
    expect(mockNegotiation.params).toHaveLength(2);

    await startClosing();
    finishClosing();
    await releaseNegotiations();

    expect(mockNative.loaded).toHaveLength(0);
    expect(mockKeepPlaybackRate).not.toHaveBeenCalled();
  });

  // The look at a stall outlived the provider: it went on asking for streams.
  test("stops looking at a stall once the provider is gone", async () => {
    const view = await mount();
    await playAt("auto");
    await playerState(false);
    await wait(6_000);
    await playerState(true);

    await act(async () => {
      await view.unmount();
    });
    await wait(5_000);
    await settle();

    expect(mockNegotiation.params).toHaveLength(1);
  });

  // The listeners were replaced while a stall lasted: their cleanup stopped
  // looking at it and nothing looked again, so it never stepped down.
  test("goes on looking at a stall when the listeners are replaced during it", async () => {
    const view = await mount();
    await playAt("auto");
    await playerState(false);
    await wait(6_000);
    await playerState(true);

    mockDownloadUtils = { ...mockDownloads };
    try {
      await act(async () => {
        await view.rerender(
          <NativePlayerProvider>
            <Probe />
          </NativePlayerProvider>,
        );
      });
      await wait(3_000);
      await settle();
    } finally {
      mockDownloadUtils = mockDownloads;
    }

    expect(mockNegotiation.params).toHaveLength(2);
    expect(mockNegotiation.params[1].maxStreamingBitrate).toEqual({
      value: 8_000_000,
    });
  });

  test("leaves a quality the user picked alone", async () => {
    await mount();
    await playAt(4_000_000);

    await stall();

    expect(mockNegotiation.params).toHaveLength(1);
  });

  test("leaves the stream alone when the setting is off", async () => {
    mockSettings.autoBitrateAdapt = false;
    await mount();
    await playAt("auto");

    await stall();

    expect(mockNegotiation.params).toHaveLength(1);
  });

  test("steps back up once the lowered stream plays steadily and the link allows", async () => {
    mockDetectBitrate.mockResolvedValue(60_000_000);
    await mount();
    await playAt("auto");
    await stall();
    await loaded();
    await playerState(false);

    await wait(2 * 60_000);
    await act(async () =>
      mockNative.emit("onProgress", {
        position: 300,
        duration: 1800,
        progress: 0,
        cacheSeconds: 9,
      }),
    );
    await settle();

    expect(mockDetectBitrate).toHaveBeenCalledWith(
      expect.anything(),
      true,
      expect.objectContaining({ ratio: 0.7 }),
    );
    expect(mockNegotiation.params).toHaveLength(3);
    // No higher than the 12 Mb/s Auto started at.
    expect(mockNegotiation.params[2].maxStreamingBitrate).toEqual({
      value: 12_000_000,
    });
    expect(log.writeToLog).toHaveBeenCalledWith(
      "INFO",
      "Auto quality stepped up",
      expect.objectContaining({
        from: 8_000_000,
        to: 12_000_000,
        measured: 60_000_000,
      }),
    );
  });

  // The provider went away while the measure ran: its result still asked for
  // a stream.
  test("asks for nothing once the provider is gone, when a measure ends", async () => {
    let finish: (bitrate: number) => void = () => undefined;
    mockDetectBitrate.mockReturnValue(
      new Promise<number>((resolve) => {
        finish = resolve;
      }),
    );
    const view = await mount();
    await playAt("auto");
    await stall();
    await loaded();
    await playerState(false);
    await wait(2 * 60_000);
    await act(async () =>
      mockNative.emit("onProgress", {
        position: 300,
        duration: 1800,
        progress: 0,
        cacheSeconds: 9,
      }),
    );
    await settle();
    expect(mockDetectBitrate).toHaveBeenCalledTimes(1);

    await act(async () => {
      await view.unmount();
    });
    await act(async () => finish(60_000_000));
    await settle();

    expect(mockNegotiation.params).toHaveLength(2);
  });

  // A quality picked during a stall, still negotiating when the stall stepped
  // down: the step down took over, and Auto stayed on.
  test("leaves a quality picked during a stall ahead of a step down", async () => {
    await mount();
    await playAt("auto");
    await playerState(false);
    await wait(6_000);
    await playerState(true);
    holdNegotiations();

    await act(async () =>
      mockNative.emit("onQualitySelected", {
        bitrateValue: 4_000_000,
        positionSec: 6,
      }),
    );
    await wait(3_000);
    await settle();

    expect(mockNegotiation.params).toHaveLength(2);
    expect(mockNegotiation.params[1].maxStreamingBitrate).toBeUndefined();
  });

  // A remote Play started Auto while a SyncPlay join was pending: in the
  // group, a stall swapped the stream under it, which holds the group.
  test("stops adapting once the player is in a SyncPlay group", async () => {
    await mount();
    await playAt("auto");
    mockSyncPlay.enabled = true;
    try {
      await stall();
    } finally {
      mockSyncPlay.enabled = false;
    }

    expect(mockNegotiation.params).toHaveLength(1);
  });

  // The join landed while the lower stream was being negotiated: the swap
  // went on and loaded under the group.
  test("drops the stream it asked for when the player joins a SyncPlay group meanwhile", async () => {
    await mount();
    await playAt("auto");
    holdNegotiations();
    await stall();
    expect(mockNegotiation.params).toHaveLength(2);

    mockSyncPlay.enabled = true;
    try {
      await releaseNegotiations();
    } finally {
      mockSyncPlay.enabled = false;
    }

    expect(mockNative.loaded).toHaveLength(0);
    expect(mockKeepPlaybackRate).not.toHaveBeenCalled();
  });

  // The dropped stream left Auto waiting for it: out of the group, the
  // stream that still stalled was never looked at again.
  test("looks at the stream again once it left the group that dropped its swap", async () => {
    await mount();
    await playAt("auto");
    holdNegotiations();
    await stall();
    mockSyncPlay.enabled = true;
    try {
      await releaseNegotiations();
    } finally {
      mockSyncPlay.enabled = false;
    }
    expect(mockNegotiation.params).toHaveLength(2);

    await wait(33_000);
    await settle();

    expect(mockNegotiation.params).toHaveLength(3);
  });

  // A track change while the measure ran: the replaced stream's callback took
  // the measure the new stream had joined, and threw its step up away.
  test("steps up from the stream the measure is for, after a track change during it", async () => {
    let finish: (bitrate: number) => void = () => undefined;
    // Every probe joins the measure running, as detectBitrate does.
    mockDetectBitrate.mockReturnValue(
      new Promise<number>((resolve) => {
        finish = resolve;
      }),
    );
    const steady = () =>
      act(async () =>
        mockNative.emit("onProgress", {
          position: 300,
          duration: 1800,
          progress: 0,
          cacheSeconds: 9,
        }),
      );
    await mount();
    await playAt("auto");
    await stall();
    await loaded();
    await playerState(false);
    await wait(2 * 60_000);
    await steady();
    await settle();

    await act(async () =>
      mockNative.emit("onTrackSelectionRequested", {
        kind: "audio",
        jellyfinIndex: 2,
        positionSec: 300,
      }),
    );
    await settle();
    await loaded();
    await playerState(false);
    await wait(6_000);
    await steady();
    await settle();
    await act(async () => finish(60_000_000));
    await settle();

    expect(mockDetectBitrate).toHaveBeenCalledTimes(2);
    expect(mockNegotiation.params).toHaveLength(4);
    expect(mockNegotiation.params[3].maxStreamingBitrate).toEqual({
      value: 12_000_000,
    });
  });
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

  // Under Auto the route names no number: the warm asks at the cap the
  // stream plays at, which the swap's own measure finds again.
  test("negotiates the next episode at the cap the stream plays at, under Auto", async () => {
    mockEngine = "exoplayer";
    await mount();
    await act(async () => {
      await player.presentFromRequest({ itemId: "item-1", offline: false });
    });
    await settle();

    expect(warmUpcomingSubtitles).toHaveBeenCalledTimes(1);
    expect(warmUpcomingSubtitles.mock.calls[0]?.[0]).toMatchObject({
      item: { Id: "item-2" },
      maxStreamingBitrate: 12_000_000,
    });
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

  // A shared channel keeps one LiveStreamId across negotiations, and the
  // server counts each of them: a release deduplicated on the id instead of
  // the session would give the swap's stream back once for two negotiations.
  test("is given back once per negotiation when they all share one stream", async () => {
    await mount();
    mockNegotiation.live = true;
    mockNegotiation.sharedLiveStreamId = "live-shared";
    await open("item-1");

    await pickQuality(4_000_000);
    await act(async () =>
      mockNative.emit("onLoad", { url: mockNative.loaded[0] }),
    );
    await startClosing();
    finishClosing();
    await settle();

    expect(liveStreamReleases()).toEqual(["live-shared", "live-shared"]);
  });

  // A close that never reached the server leaves the reference taken. The
  // teardown of a restored swap releases the same session again, and has to
  // try once more instead of taking the failed close for a done one.
  test("is given back again when its close failed", async () => {
    await mount();
    mockNegotiation.live = true;
    await open("item-1");
    api.mock.resetHandlers();
    api.mock.onPost(/\/LiveStreams\/Close/).replyOnce(500);
    api.mock.onAny().reply(200, {});
    // The teardown sends its final progress before it releases: a round trip
    // that, in the app, comes back after the failed close did.
    const finalProgress: Array<() => void> = [];
    mockRemoteProgress.held = finalProgress;
    mockNative.refuseLoad = true;

    await pickQuality(4_000_000);
    expect(finalProgress).toHaveLength(1);
    expect(liveStreamReleases().sort()).toEqual([
      "live-play-session-1",
      "live-play-session-2",
    ]);
    await act(async () => {
      for (const answer of finalProgress.splice(0)) answer();
    });
    await settle();

    expect(mockNative.session).toBeNull();
    expect(liveStreamReleases().sort()).toEqual([
      "live-play-session-1",
      "live-play-session-1",
      "live-play-session-2",
    ]);
  });
});
