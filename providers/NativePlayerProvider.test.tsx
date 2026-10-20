import { act, render } from "@testing-library/react-native";
import type { NativePlayerEvents } from "@/modules/mpv-player";
import type { makeApi } from "@/test-utils/jellyfinApi";
import { stubReactNative } from "@/test-utils/reactNative";
import { NativePlayerProvider, useNativePlayer } from "./NativePlayerProvider";

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
};

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
          mediaSource: { Id: `source-${req.itemId}` },
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
const mockOrientation = {
  lockOrientation: mockNoop,
  unlockOrientation: mockNoop,
};

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: mockT }),
}));
jest.mock("react-native-edge-to-edge", () => ({ SystemBars: () => null }));
jest.mock("@/packages/expo-screen-orientation", () => ({
  OrientationLock: { PORTRAIT_UP: 1, LANDSCAPE: 5 },
}));
jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  const { makeApi: make } = jest.requireActual("@/test-utils/jellyfinApi");
  const mockApi = make();
  mockApi.mock.onAny().reply(200, {});
  return { apiAtom: atom(mockApi), userAtom: atom({ Id: "user-1" }), mockApi };
});
jest.mock("@/providers/DownloadProvider", () => ({
  useDownload: () => mockDownloads,
}));
jest.mock("@/providers/SyncPlayProvider", () => ({
  useSyncPlay: () => mockSyncPlay,
}));
jest.mock("@/providers/WebSocketProvider", () => ({
  useWebSocketContext: () => mockSocket,
}));
jest.mock("@/hooks/useNetworkStatus", () => ({
  useNetworkStatus: () => ({ isConnected: true }),
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
  useSettings: () => ({
    settings: mockSettings,
    updateSettings: mockUpdateSettings,
    pluginSettings: undefined,
  }),
}));
jest.mock("@/utils/jellyfin/getDefaultPlaySettings", () => ({
  getDefaultPlaySettings: (item: { Id?: string }) => ({
    mediaSource: { Id: `source-${item.Id}` },
    audioIndex: undefined,
    subtitleIndex: -1,
  }),
  getAdjacentStartTicks: () => undefined,
}));
jest.mock("@/utils/jellyfin/image/getPrimaryImageUrl", () => ({
  getPrimaryImageUrl: () => null,
}));
jest.mock("@/utils/log", () => ({
  logAndCaptureError: jest.fn(),
  writeErrorLog: jest.fn(),
  writeInfoLog: jest.fn(),
  writeToLog: jest.fn(),
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
).mockApi;
const log: { logAndCaptureError: jest.Mock } = jest.requireMock("@/utils/log");

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
 * The player closing on its own (the close button, the end of the stream):
 * onDismiss goes out while the module still holds its session.
 */
const startClosing = async () => {
  if (mockNative.session) mockNative.session.closing = true;
  await act(async () =>
    mockNative.emit("onDismiss", {
      positionSec: 60,
      durationSec: 1800,
      reason: "closeButton",
    }),
  );
  await settle();
};

/** The dismissal is over: the cross-dissolve on iOS, the same pass on Android. */
const finishClosing = () => {
  mockNative.session = null;
};

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
  mockNegotiation.held = false;
  mockNegotiation.waiting = [];
  mockNegotiation.count = 0;
  api.mock.resetHistory();
  log.logAndCaptureError.mockClear();
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
