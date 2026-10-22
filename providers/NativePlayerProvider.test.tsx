import { act, render, screen, waitFor } from "@testing-library/react-native";
import type { makeApi } from "@/test-utils/jellyfinApi";
import { writeToLog } from "@/utils/log";
import type { PlayRequest } from "@/utils/nativePlayer/playRequest";
import { NativePlayerProvider, useNativePlayer } from "./NativePlayerProvider";

type Listener = (payload: Record<string, unknown>) => void;

/** What the native module was asked to call back, by event name. */
const mockListeners: Record<string, Listener> = {};
const mockPrune = jest.fn((_itemIds: string[]) => {});
const mockNoop = () => {};
const mockSettings: { useKefinTweaks?: boolean } = {};
const mockSyncPlay = {
  enabled: false,
  playlist: [],
  error: null,
  resolveVideos: async () => [],
  registerPlayer: () => mockNoop,
  notifyBuffering: mockNoop,
};
const mockWebSocket = {
  subscribe: () => mockNoop,
  clearLastMessage: mockNoop,
  retainInBackground: () => mockNoop,
};
const mockPlaybackManager = {
  saveLocalPlaybackProgress: mockNoop,
  reportRemotePlaybackProgress: async () => {},
  nextItem: null,
  previousItem: null,
};
const mockStreamUrl = "https://jellyfin.example.com/Videos/item-1/stream.mkv";
/** When item-1 was last played, as the config build fetched it. */
const mockLastPlayed = "2026-09-21T20:00:00.0000000Z";
/** Replaces fields of the session the config build describes. */
let mockSeedOverrides: Record<string, unknown> = {};
let mockIsConnected = true;

jest.mock("@/modules/mpv-player", () => {
  const asyncNoop = async () => {};
  return {
    addNativePlayerListener: (name: string, listener: Listener) => {
      mockListeners[name] = listener;
      return {
        remove: () => {
          delete mockListeners[name];
        },
      };
    },
    applyNativePlayerSyncPlayCommand: asyncNoop,
    cancelNativePlayerSyncPlayCommands: asyncNoop,
    dismissNativePlayer: asyncNoop,
    isNativePlayerModuleAvailable: () => true,
    isNativePlayerPresented: () => true,
    isNativePlayerSyncPlayAvailable: () => false,
    loadNativePlayerStream: asyncNoop,
    nativePlayerAddExternalSubtitle: asyncNoop,
    nativePlayerDisableSubtitles: asyncNoop,
    nativePlayerGetSubtitleTracks: async () => [],
    nativePlayerPause: asyncNoop,
    nativePlayerPlay: asyncNoop,
    nativePlayerSeekTo: asyncNoop,
    nativePlayerSetAudioTrack: asyncNoop,
    nativePlayerSetSpeed: asyncNoop,
    nativePlayerSetSubtitleTrack: asyncNoop,
    nativePlayerShowNotice: asyncNoop,
    nativePlayerToggleMute: asyncNoop,
    presentNativePlayer: asyncNoop,
    updateNativePlayerEpisodeList: asyncNoop,
    updateNativePlayerNextEpisode: asyncNoop,
    updateNativePlayerSegments: asyncNoop,
    updateNativePlayerSubtitleSearch: asyncNoop,
    updateNativePlayerSyncPlay: asyncNoop,
    updateNativePlayerTrackMenus: asyncNoop,
  };
});
// The session a built config describes; how it is built from the item and
// the server is buildNativePlayerConfig.test.ts's business.
jest.mock("@/utils/nativePlayer/buildNativePlayerConfig", () => ({
  buildNativePlayerConfig: async () => ({
    seed: {
      item: {
        Id: "item-1",
        Type: "Movie",
        RunTimeTicks: 72_000_000_000,
        UserData: { LastPlayedDate: mockLastPlayed },
      },
      offline: false,
      downloadedItem: null,
      stream: {
        url: mockStreamUrl,
        sessionId: "session-1",
        mediaSource: { Id: "source-1", MediaStreams: [] },
      },
      mediaSourceId: "source-1",
      subtitleIndex: -1,
      startTicks: 0,
      playMethod: "DirectPlay",
      ...mockSeedOverrides,
    },
    config: { stream: { autoplay: true }, ui: {} },
  }),
  buildNativePlayerStrings: () => ({}),
  buildTrackMenus: () => ({}),
}));
jest.mock("@/utils/atoms/settings", () => ({
  isNativeChromeActive: () => true,
  isNativePlayerSupported: true,
  isNativePlayerSupportedAndroidTV: false,
  isNativePlayerSupportedTV: false,
  useSettings: () => ({
    settings: mockSettings,
    updateSettings: mockNoop,
    pluginSettings: {},
  }),
}));
jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  const { makeApi: make } = jest.requireActual("@/test-utils/jellyfinApi");
  const mockApi = make();
  return { apiAtom: atom(mockApi), userAtom: atom({ Id: "user-1" }), mockApi };
});
jest.mock("@/providers/DownloadProvider", () => ({
  useDownload: () => ({
    getDownloadedItems: () => [],
    getDownloadedItemById: () => undefined,
  }),
}));
jest.mock("@/providers/SyncPlayProvider", () => ({
  useSyncPlay: () => mockSyncPlay,
}));
jest.mock("@/providers/WebSocketProvider", () => ({
  useWebSocketContext: () => mockWebSocket,
}));
jest.mock("@/hooks/usePlaybackManager", () => ({
  usePlaybackManager: () => mockPlaybackManager,
}));
jest.mock("@/hooks/useOrientation", () => ({
  useOrientation: () => ({
    lockOrientation: mockNoop,
    unlockOrientation: mockNoop,
  }),
}));
jest.mock("@/hooks/useNetworkStatus", () => ({
  useNetworkStatus: () => ({ isConnected: mockIsConnected }),
}));
jest.mock("@/hooks/useRemoteSubtitles", () => ({
  useRemoteSubtitles: () => ({}),
}));
jest.mock("@/hooks/useRevalidatePlaybackProgressCache", () => ({
  useInvalidatePlaybackProgressCache: () => mockNoop,
}));
jest.mock("@/hooks/useServerVersion", () => ({
  useServerVersion: () => "12.0.0",
}));
jest.mock("@/hooks/useWatchlist", () => ({
  usePruneWatchedFromWatchlist: () => mockPrune,
}));
jest.mock("@/utils/segments", () => ({
  fetchAndParseSegments: async () => ({
    introSegments: [],
    creditSegments: [],
    recapSegments: [],
    commercialSegments: [],
    previewSegments: [],
  }),
  getSegmentsForItem: () => ({}),
}));
jest.mock("@/utils/log", () => ({
  logAndCaptureError: jest.fn(),
  writeErrorLog: jest.fn(),
  writeInfoLog: jest.fn(),
  writeToLog: jest.fn(),
}));
jest.mock("@/components/BitrateSelector", () => ({
  BITRATES: [{ key: "Max", value: undefined }],
}));
jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock("react-native-edge-to-edge", () => ({ SystemBars: () => null }));
jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);

const api: ReturnType<typeof makeApi> = jest.requireMock(
  "@/providers/JellyfinProvider",
).mockApi;

/** What the player asked the server about item-1's user data. */
const userDataReads = () =>
  api.mock.history.get.filter((request) =>
    request.url?.includes("/UserItems/item-1/UserData"),
  );

const startReports = () =>
  api.mock.history.post.filter((request) =>
    request.url?.endsWith("/Sessions/Playing"),
  );

const stopReports = () =>
  api.mock.history.post
    .filter((request) => request.url?.endsWith("/Sessions/Playing/Stopped"))
    .map((request) => JSON.parse(request.data));

let present: ((req: PlayRequest) => Promise<boolean>) | null = null;

const CapturePresent = () => {
  present = useNativePlayer().presentFromRequest;
  return null;
};

/** Presents the native player for item-1 and lets it load its stream. */
const presentPlayer = async (offline = false) => {
  await render(
    <NativePlayerProvider>
      <CapturePresent />
    </NativePlayerProvider>,
  );
  await act(async () => {
    await present?.({ itemId: "item-1", subtitleIndex: -1, offline });
  });
  await act(async () => mockListeners.onLoad?.({ url: mockStreamUrl }));
};

/** Presents the native player for item-1 and waits for its start report. */
const openPlayer = async (offline = false) => {
  await presentPlayer(offline);
  await waitFor(() => expect(startReports()).toHaveLength(1));
};

/** Lets the requests already sent, and what waits on their answers, finish. */
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

/** What the native module sends when the user closes the player. */
const closePlayer = async (positionSec: number) => {
  await act(async () =>
    mockListeners.onDismiss?.({ positionSec, reason: "user" }),
  );
  await waitFor(() => expect(stopReports()).toHaveLength(1));
};

beforeEach(() => {
  mockPrune.mockClear();
  (writeToLog as jest.Mock).mockClear();
  api.mock.reset();
});

// The server decides at the stop report whether the item now counts as
// played, and the watchlist prune reads that back: it has to come after.
test("hands the item to the watchlist prune once the stop report went through", async () => {
  let answerStop: () => void = () => {};
  api.mock.onPost(/\/Sessions\/Playing/).reply((config) =>
    config.url?.endsWith("/Stopped")
      ? new Promise((resolve) => {
          answerStop = () => resolve([204]);
        })
      : [204],
  );
  await openPlayer();
  await closePlayer(4000);
  expect(stopReports()[0]).toMatchObject({
    ItemId: "item-1",
    PlaySessionId: "session-1",
  });
  expect(mockPrune).not.toHaveBeenCalled();

  await act(async () => answerStop());

  // The date the item had before playback started, see
  // removeWatchedFromWatchlist.
  await waitFor(() =>
    expect(mockPrune).toHaveBeenCalledWith(
      ["item-1"],
      new Map([["item-1", mockLastPlayed]]),
    ),
  );
});

// A streamed item comes from the server: what the config build fetched is
// what the stop is judged by, and nothing more is read before the start.
test("reads nothing more for a streamed item with KefinTweaks on", async () => {
  mockSettings.useKefinTweaks = true;
  try {
    api.mock.onPost(/\/Sessions\/Playing/).reply(204);
    await openPlayer();
    await closePlayer(4000);

    await waitFor(() =>
      expect(mockPrune).toHaveBeenCalledWith(
        ["item-1"],
        new Map([["item-1", mockLastPlayed]]),
      ),
    );
    expect(userDataReads()).toHaveLength(0);
  } finally {
    delete mockSettings.useKefinTweaks;
  }
});

test("leaves the watchlist alone when the stop report fails", async () => {
  api.mock
    .onPost(/\/Sessions\/Playing/)
    .reply((config) => (config.url?.endsWith("/Stopped") ? [500] : [204]));
  await openPlayer();
  await closePlayer(4000);
  await waitFor(() =>
    expect(writeToLog).toHaveBeenCalledWith(
      "ERROR",
      "NativePlayer reportPlaybackStopped failed",
      expect.any(String),
    ),
  );

  expect(mockPrune).not.toHaveBeenCalled();
});

// As in utils/directPlayer/directPlayerPage.test.tsx: a downloaded item comes
// from the downloads record, whose LastPlayedDate the app writes itself, and
// its stop was judged against that date, so a 12.2 rewatch left under 5% lost
// its watchlist entry.
describe("a playback of the item's download", () => {
  /** The record's copy of the date: the app's clock, three digits. */
  const RECORD_LAST_PLAYED = "2026-10-21T14:58:12.345Z";

  beforeEach(() => {
    const item = {
      Id: "item-1",
      Type: "Movie",
      RunTimeTicks: 72_000_000_000,
      UserData: { Played: true, LastPlayedDate: RECORD_LAST_PLAYED },
    };
    const mediaSource = { Id: "source-1", MediaStreams: [] };
    mockSeedOverrides = {
      item,
      offline: true,
      downloadedItem: {
        item,
        mediaSource,
        videoFilePath: mockStreamUrl,
        videoFileSize: 0,
        userData: { audioStreamIndex: 0, subtitleStreamIndex: -1 },
      },
      // A downloaded file opens no server session.
      stream: { url: mockStreamUrl, sessionId: "", mediaSource },
    };
    mockSettings.useKefinTweaks = true;
    api.mock.onPost(/\/Sessions\/Playing/).reply(204);
    api.mock.onGet(/\/UserItems\/item-1\/UserData/).reply(200, {
      Played: true,
      PlaybackPositionTicks: 0,
      LastPlayedDate: mockLastPlayed,
    });
  });

  afterEach(() => {
    mockSeedOverrides = {};
    mockIsConnected = true;
    delete mockSettings.useKefinTweaks;
  });

  test("hands the watchlist prune the date the server held, not the record's", async () => {
    await openPlayer(true);
    await closePlayer(4000);

    await waitFor(() =>
      expect(mockPrune).toHaveBeenCalledWith(
        ["item-1"],
        new Map([["item-1", mockLastPlayed]]),
      ),
    );
  });

  // Jellyfin 10.11 moves the date as playback starts.
  test("reads that date before it reports the start", async () => {
    let answerRead: () => void = () => {};
    api.mock.onGet(/\/UserItems\/item-1\/UserData/).reply(
      () =>
        new Promise((resolve) => {
          answerRead = () =>
            resolve([200, { Played: true, LastPlayedDate: mockLastPlayed }]);
        }),
    );
    await presentPlayer(true);
    await waitFor(() => expect(userDataReads()).toHaveLength(1));
    await settle();
    expect(startReports()).toHaveLength(0);

    await act(async () => answerRead());

    await waitFor(() => expect(startReports()).toHaveLength(1));
  });

  test("leaves the watchlist alone when the server's date could not be read", async () => {
    api.mock.onGet(/\/UserItems\/item-1\/UserData/).reply(500);
    await openPlayer(true);
    await closePlayer(4000);
    await settle();

    expect(mockPrune).not.toHaveBeenCalled();
  });

  // No start report went out, so nothing was read before one.
  test("leaves the watchlist alone when playback started offline", async () => {
    mockIsConnected = false;
    await presentPlayer(true);
    mockIsConnected = true;
    await screen.rerender(
      <NativePlayerProvider>
        <CapturePresent />
      </NativePlayerProvider>,
    );
    await closePlayer(4000);
    await settle();

    expect(startReports()).toHaveLength(0);
    expect(mockPrune).not.toHaveBeenCalled();
  });
});
