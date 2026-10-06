// Spec for app/(auth)/player/direct-player.tsx. It lives here rather than next
// to the page because Expo Router turns every file under app/ into a route.
import { act, render, screen, waitFor } from "@testing-library/react-native";
import DirectPlayerPage from "@/app/(auth)/player/direct-player";
import type { MpvPlayerViewProps } from "@/modules";
import type { makeApi } from "@/test-utils/jellyfinApi";
import { stubReactNative } from "@/test-utils/reactNative";
import {
  holdSharedValueWrites,
  releaseSharedValueWrites,
} from "@/test-utils/reanimated";
import type { SyncPlayPlayerAdapter } from "@/utils/syncplay/types";

/** 19m 18s, the resume position of the item in the bug report. */
const RESUME_TICKS = 11_580_000_000;
/** 5m, the resume position of the episode after it. */
const NEXT_RESUME_TICKS = 3_000_000_000;
const RUNTIME_TICKS = 34_000_000_000;

const mockParams = {
  itemId: "item-1",
  audioIndex: "",
  subtitleIndex: "",
  mediaSourceId: "source-1",
  bitrateValue: "",
  offline: "false",
  playbackPosition: String(RESUME_TICKS),
};
const mockListeners: Record<string, () => void> = {};
const mockNavigation = {
  addListener: (event: string, listener: () => void) => {
    mockListeners[event] = listener;
    return () => delete mockListeners[event];
  },
};
const mockRouter = { setParams: jest.fn(), replace: jest.fn() };
const mockReportProgress = jest.fn(async (_info: unknown) => {});
const mockPlayer = {
  destroy: jest.fn(async () => {}),
  seekTo: jest.fn(),
  play: jest.fn(),
  pause: jest.fn(async () => {}),
  setSpeed: jest.fn(async () => {}),
};
let mockPlayerProps: MpvPlayerViewProps | null = null;
/** How many MPV views have mounted: each one loads its source from scratch. */
let mockPlayerMounts = 0;
/** What the page handed the controls: the shared position and its handlers. */
type ControlsProps = {
  togglePlay: () => Promise<void>;
  progress: { get: () => number; set: (ms: number) => void };
  seek: (ms: number) => void;
  onBitrateChange?: (bitrate: number | undefined) => void;
  onAudioIndexChange?: (index: number) => void;
};
let mockControlsProps: ControlsProps | null = null;
/** What the page does when the seeking flag changes, to run by hand: the
 * reaction itself lives on the UI thread, which a spec does not have. */
let mockSeekReaction:
  | ((seeking: boolean, wasSeeking: boolean | null) => void)
  | null = null;
/** Set to have the server answer with a transcode instead of a direct stream. */
let mockTranscodingUrl: string | undefined;
const mockStreamWaits = new Map<string, Promise<void>>();
const mockStreamRequests: string[] = [];
const mockSettings = {};
const mockNoop = () => {};
let mockSyncPlayer: SyncPlayPlayerAdapter | null = null;
let mockNativeSyncPlayAvailable = false;
jest.mock("@/modules/mpv-player", () => ({
  isNativePlayerSyncPlayAvailable: () => mockNativeSyncPlayAvailable,
}));
const mockSyncPlay = {
  enabled: false,
  registerPlayer: jest.fn((player: SyncPlayPlayerAdapter) => {
    mockSyncPlayer = player;
    return () => {
      mockSyncPlayer = null;
    };
  }),
  requestPause: jest.fn(async () => {}),
  requestUnpause: jest.fn(async () => {}),
  requestSeek: jest.fn(async (_ticks: number) => {}),
  leaveGroup: jest.fn(async () => {}),
  notifyReady: jest.fn(),
  notifyBuffering: jest.fn(),
  notifyProgress: jest.fn(),
  notifyEnded: jest.fn(),
};
jest.mock("@/providers/SyncPlayProvider", () => ({
  useSyncPlay: () => mockSyncPlay,
}));
jest.mock("@/components/syncplay/SyncPlayStatus", () => ({
  SyncPlayStatus: () => null,
}));

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams,
  useNavigation: () => mockNavigation,
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual("@/test-utils/reanimated").reanimatedModule,
  useAnimatedReaction: (_prepare: unknown, react: typeof mockSeekReaction) => {
    mockSeekReaction = react;
  },
}));
jest.mock("react-native-volume-manager", () => ({}));
jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);
jest.mock("@/utils/customHeaders", () =>
  jest.requireActual("@/test-utils/customHeaders").customHeadersModule(),
);
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
jest.mock("@/providers/InactivityProvider", () => ({
  useInactivity: () => ({
    pauseInactivityTimer: mockNoop,
    resumeInactivityTimer: mockNoop,
  }),
}));
jest.mock("@/providers/OfflineModeProvider", () => ({
  OfflineModeProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));
jest.mock("@/hooks/useAppRouter", () => ({
  __esModule: true,
  default: () => mockRouter,
}));
jest.mock("@/hooks/useHaptic", () => ({ useHaptic: () => mockNoop }));
jest.mock("@/hooks/useNetworkStatus", () => ({
  useNetworkStatus: () => ({ isConnected: true }),
}));
jest.mock("@/hooks/useOrientation", () => ({
  useOrientation: () => ({
    lockOrientation: mockNoop,
    unlockOrientation: mockNoop,
  }),
}));
jest.mock("@/hooks/usePlaybackManager", () => ({
  usePlaybackManager: () => ({
    reportPlaybackProgress: mockReportProgress,
    nextItem: null,
    previousItem: null,
  }),
}));
jest.mock("@/hooks/usePlaybackSpeed", () => ({
  __esModule: true,
  default: () => ({ playbackSpeed: 1 }),
}));
jest.mock("@/hooks/useRevalidatePlaybackProgressCache", () => ({
  useInvalidatePlaybackProgressCache: () => mockNoop,
}));
jest.mock("@/hooks/useWebsockets", () => ({ useWebSocket: () => {} }));
jest.mock("@/utils/atoms/settings", () => ({
  getActivePlayerType: () => "mpv",
  useSettings: () => ({ settings: mockSettings, updateSettings: mockNoop }),
}));
jest.mock("@/utils/atoms/downloadedSubtitles", () => ({
  getSubtitlesForItem: () => [],
}));
jest.mock("@/utils/log", () => ({
  logAndCaptureError: jest.fn(),
  writeToLog: jest.fn(),
}));
jest.mock("@/utils/profiles/native", () => ({
  generateDeviceProfile: () => ({}),
}));
jest.mock("@/utils/jellyfin/media/getStreamUrl", () => ({
  getStreamUrl: async ({ item }: { item: { Id: string } }) => {
    mockStreamRequests.push(item.Id);
    await mockStreamWaits.get(item.Id);
    return {
      mediaSource: {
        Id: "source-1",
        MediaStreams: [],
        TranscodingUrl: mockTranscodingUrl,
      },
      sessionId: `session-${item.Id}`,
      url: `https://jellyfin.example.com/Videos/${item.Id}/stream.mkv`,
    };
  },
}));
jest.mock("@/utils/subtitles/subtitleStyle", () => ({
  applySubtitleStyle: async () => {},
  buildSubtitleStyle: () => ({}),
}));
jest.mock("@/components/BitrateSelector", () => ({
  BITRATES: [{ key: "Max", value: undefined }],
}));
jest.mock("@/components/Loader", () => ({ Loader: () => null }));
jest.mock("@/components/common/Text", () => ({ Text: () => null }));
jest.mock("@/components/video-player/controls/AutoSubtitleNotice", () => ({
  AutoSubtitleNotice: () => null,
}));
// The real controls seed the shared position with the item's resume point for
// the scrubber. That is display state: the reports must not depend on which
// controls happen to be mounted, so these render nothing and seed nothing. A
// test that needs the seed, or a handler the controls call, goes through the
// props they were given.
jest.mock("@/components/video-player/controls/Controls", () => ({
  Controls: (props: ControlsProps) => {
    mockControlsProps = props;
    return null;
  },
}));
jest.mock("@/components/video-player/controls/Controls.tv", () => ({
  Controls: (props: ControlsProps) => {
    mockControlsProps = props;
    return null;
  },
}));
jest.mock("@/components/video-player/controls/contexts/PlayerContext", () => ({
  PlayerProvider: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock("@/components/video-player/controls/contexts/VideoContext", () => ({
  VideoProvider: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock("@/components/video-player/controls/hooks", () => ({
  useAutoSubtitlesOnMute: () => ({ notice: null, clearNotice: mockNoop }),
  useMuteState: () => ({
    isMuted: false,
    toggleMute: mockNoop,
    reapplyPlayerMute: mockNoop,
  }),
}));
jest.mock(
  "@/components/video-player/controls/utils/playback-speed-settings",
  () => ({ updatePlaybackSpeedSettings: () => {} }),
);
jest.mock("@/components/video-player/VideoPlayerView", () => {
  const React = jest.requireActual("react");
  const { View } = jest.requireActual("react-native");
  return {
    VideoPlayerView: React.forwardRef(
      (props: MpvPlayerViewProps, ref: React.Ref<unknown>) => {
        React.useImperativeHandle(ref, () => mockPlayer);
        React.useEffect(() => {
          mockPlayerMounts += 1;
        }, []);
        mockPlayerProps = props;
        return <View testID='mpv-view' />;
      },
    ),
  };
});

const api: ReturnType<typeof makeApi> = jest.requireMock(
  "@/providers/JellyfinProvider",
).mockApi;

const stopReports = () =>
  api.mock.history.post
    .filter((request) => request.url?.endsWith("/Sessions/Playing/Stopped"))
    .map((request) => JSON.parse(request.data));

const startReports = () =>
  api.mock.history.post.filter((request) =>
    request.url?.endsWith("/Sessions/Playing"),
  );

/** Opens the player and waits until MPV has been handed the stream. */
const openPlayer = async () => {
  await render(<DirectPlayerPage />);
  await waitFor(() => expect(screen.getByTestId("mpv-view")).toBeTruthy());
  await waitFor(() => expect(startReports()).toHaveLength(1));
};

/** What the native view sends when MPV starts or resumes playing. */
const announcePlaying = async () => {
  await act(async () => {
    await mockPlayerProps?.onPlaybackStateChange?.({
      nativeEvent: { isPaused: false, isPlaying: true },
    } as Parameters<
      NonNullable<MpvPlayerViewProps["onPlaybackStateChange"]>
    >[0]);
  });
};

/** The position a handler asked the route to restart the player from. */
const restartPosition = () => {
  const [href] = mockRouter.replace.mock.calls[0];
  return new URLSearchParams(String(href).split("?")[1]).get(
    "playbackPosition",
  );
};

const progressEvent = (position: number) =>
  ({
    nativeEvent: {
      position,
      duration: 3400,
      progress: position / 3400,
      cacheSeconds: 0,
    },
  }) as Parameters<NonNullable<MpvPlayerViewProps["onProgress"]>>[0];

const tick = async (position: number) => {
  await act(async () => {
    await mockPlayerProps?.onProgress?.(progressEvent(position));
  });
};

/**
 * The ticks MPV sent while the JS thread was held up, handled back to back
 * once it is free: none of them sees what the one before wrote to a shared
 * value, the UI thread has not taken it yet. `at` is the time they are handled.
 */
const pileUp = async (positions: number[], at = Date.now()) => {
  const clock = jest.spyOn(Date, "now").mockReturnValue(at);
  holdSharedValueWrites();
  try {
    await act(async () => {
      for (const position of positions) {
        void mockPlayerProps?.onProgress?.(progressEvent(position));
      }
    });
  } finally {
    releaseSharedValueWrites();
    clock.mockRestore();
  }
};

/** Hardware back, the header button and a swipe all arrive as beforeRemove. */
const leavePlayer = async () => {
  await act(async () => {
    mockListeners.beforeRemove?.();
  });
  await waitFor(() => expect(stopReports()).toHaveLength(1));
};

describe("direct player stop report", () => {
  beforeEach(() => {
    mockSyncPlay.enabled = false;
    mockNativeSyncPlayAvailable = false;
    for (const value of Object.values(mockSyncPlay)) {
      if (typeof value === "function") value.mockClear();
    }
    // The page logs each stream fetch it skips while the item is loading.
    jest.spyOn(console, "log").mockImplementation(() => {});
    mockPlayerProps = null;
    mockPlayerMounts = 0;
    mockControlsProps = null;
    mockSeekReaction = null;
    mockTranscodingUrl = undefined;
    mockStreamWaits.clear();
    mockStreamRequests.length = 0;
    mockRouter.setParams.mockClear();
    mockRouter.replace.mockClear();
    mockReportProgress.mockClear();
    api.mock.reset();
    api.mock.onGet(/\/Items\/item-1/).reply(200, {
      Id: "item-1",
      Type: "Episode",
      RunTimeTicks: RUNTIME_TICKS,
      UserData: { PlaybackPositionTicks: RESUME_TICKS },
    });
    api.mock.onGet(/\/Items\/item-2/).reply(200, {
      Id: "item-2",
      Type: "Episode",
      RunTimeTicks: RUNTIME_TICKS,
      UserData: { PlaybackPositionTicks: NEXT_RESUME_TICKS },
    });
    api.mock.onPost(/\/Sessions\/Playing/).reply(204);
  });

  afterEach(async () => {
    // Unmounting sends the stop report for a player the test did not leave.
    // Wait for it here, or it lands in the next test's request history.
    const sessions = new Set(
      startReports().map((request) => JSON.parse(request.data).PlaySessionId),
    ).size;
    screen.unmount();
    await waitFor(() => expect(stopReports()).toHaveLength(sessions));
    jest.restoreAllMocks();
  });

  test("the deprecated player cannot replace or signal the native SyncPlay adapter", async () => {
    mockNativeSyncPlayAvailable = true;
    mockSyncPlay.enabled = true;
    await openPlayer();
    await act(async () => {
      mockPlayerProps?.onLoad?.({
        nativeEvent: { url: mockPlayerProps.source!.url },
      });
      mockPlayerProps?.onTracksReady?.({ nativeEvent: {} });
      mockPlayerProps?.onPlaybackStateChange?.({
        nativeEvent: { isLoading: true },
      });
      mockPlayerProps?.onPlaybackEnded?.({ nativeEvent: {} });
    });
    expect(mockSyncPlay.registerPlayer).not.toHaveBeenCalled();
    expect(mockSyncPlay.notifyReady).not.toHaveBeenCalled();
    expect(mockSyncPlay.notifyBuffering).not.toHaveBeenCalled();
    expect(mockSyncPlay.notifyEnded).not.toHaveBeenCalled();
    await leavePlayer();
    expect(mockSyncPlay.leaveGroup).not.toHaveBeenCalled();
  });

  test("SyncPlay loads paused and waits for server commands after ready", async () => {
    mockSyncPlay.enabled = true;
    await openPlayer();
    expect(mockPlayerProps?.source?.autoplay).toBe(false);
    expect(JSON.parse(startReports()[0].data).IsPaused).toBe(true);
    await act(async () => {
      mockPlayerProps?.onLoad?.({
        nativeEvent: { url: mockPlayerProps.source!.url },
      });
      mockPlayerProps?.onTracksReady?.({ nativeEvent: {} });
    });
    expect(mockSyncPlay.notifyReady).toHaveBeenCalledTimes(1);
    expect(mockSyncPlayer?.getState().isReady).toBe(true);
  });

  test("group source loading and initial seek preserve a fractional start", async () => {
    mockSyncPlay.enabled = true;
    mockParams.playbackPosition = "288000000";
    try {
      await openPlayer();
      expect(mockPlayerProps?.source?.startPosition).toBe(28.8);
      mockPlayer.seekTo.mockClear();
      await act(async () => {
        mockPlayerProps?.onLoad?.({
          nativeEvent: { url: mockPlayerProps.source!.url },
        });
        mockPlayerProps?.onTracksReady?.({ nativeEvent: {} });
      });
      expect(mockPlayer.seekTo).toHaveBeenCalledWith(28.8);
    } finally {
      mockParams.playbackPosition = String(RESUME_TICKS);
    }
  });

  test("SyncPlay controls request pause and seek without executing them locally", async () => {
    mockSyncPlay.enabled = true;
    await openPlayer();
    await announcePlaying();
    mockPlayer.pause.mockClear();
    mockPlayer.seekTo.mockClear();
    await act(async () => {
      await mockControlsProps?.togglePlay();
      mockControlsProps?.seek(12345);
    });
    expect(mockSyncPlay.requestPause).toHaveBeenCalledTimes(1);
    expect(mockSyncPlay.requestSeek).toHaveBeenCalledWith(123450000);
    expect(mockPlayer.pause).not.toHaveBeenCalled();
    expect(mockPlayer.seekTo).not.toHaveBeenCalled();
  });

  test("advances SyncPlay only on genuine decoder EOF", async () => {
    mockSyncPlay.enabled = true;
    await openPlayer();
    await tick(RUNTIME_TICKS / 10000000 - 0.05);
    expect(mockSyncPlay.notifyEnded).not.toHaveBeenCalled();
    await act(async () => {
      mockPlayerProps?.onPlaybackEnded?.({ nativeEvent: {} });
    });
    expect(mockSyncPlay.notifyEnded).toHaveBeenCalledTimes(1);
  });

  test("ignores an outgoing item's stream response after a shared queue switch", async () => {
    mockSyncPlay.enabled = true;
    let resolveOld!: () => void;
    mockStreamWaits.set(
      "item-1",
      new Promise<void>((resolve) => {
        resolveOld = resolve;
      }),
    );
    await render(<DirectPlayerPage />);
    await waitFor(() => expect(mockStreamRequests).toContain("item-1"));
    mockParams.itemId = "item-2";
    mockParams.playbackPosition = "0";
    try {
      await screen.rerender(<DirectPlayerPage />);
      await waitFor(() => expect(startReports()).toHaveLength(1));
      await act(async () => resolveOld());
      expect(mockPlayerProps?.source?.url).toContain("/Videos/item-2/");
      expect(startReports()).toHaveLength(1);
      expect(JSON.parse(startReports()[0].data).ItemId).toBe("item-2");
    } finally {
      resolveOld();
      mockParams.itemId = "item-1";
      mockParams.playbackPosition = String(RESUME_TICKS);
    }
  });

  test("server pause and seek apply locally without echoing control requests", async () => {
    mockSyncPlay.enabled = true;
    await openPlayer();
    mockPlayer.seekTo.mockClear();
    mockPlayer.pause.mockClear();
    await act(async () => {
      await mockSyncPlayer?.pause();
      await mockSyncPlayer?.seek(420000000);
    });
    expect(mockPlayer.pause).toHaveBeenCalledTimes(1);
    expect(mockPlayer.seekTo).toHaveBeenCalledWith(42);
    expect(mockSyncPlay.requestPause).not.toHaveBeenCalled();
    expect(mockSyncPlay.requestSeek).not.toHaveBeenCalled();
    await tick(42);
    expect(mockSyncPlayer?.getState().positionTicks).toBe(420000000);
  });

  test("a paused group seek reports once at the actual target even before UI writes land", async () => {
    mockSyncPlay.enabled = true;
    await openPlayer();
    await tick(1200);
    mockReportProgress.mockClear();
    mockRouter.setParams.mockClear();
    await act(async () => {
      await mockSyncPlayer?.seek(420000000);
    });
    expect(mockReportProgress).not.toHaveBeenCalled();
    await pileUp([1199, 40]);
    expect(mockReportProgress).not.toHaveBeenCalled();
    await pileUp([42, 42.1, 42.2]);
    expect(mockReportProgress).toHaveBeenCalledTimes(1);
    expect(mockReportProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        ItemId: "item-1",
        PositionTicks: 420000000,
        IsPaused: true,
      }),
    );
    expect(mockRouter.setParams).toHaveBeenCalledTimes(1);
    expect(mockSyncPlay.requestSeek).not.toHaveBeenCalled();
  });

  test("a paused fractional group seek reaches 28.8 seconds and reports that position", async () => {
    mockSyncPlay.enabled = true;
    await openPlayer();
    await tick(1200);
    mockReportProgress.mockClear();
    mockPlayer.seekTo.mockClear();
    // The decoder reaches the position it was actually asked to seek to.
    // Flooring here would land 800 ms short and never satisfy group Ready.
    mockPlayer.seekTo.mockImplementationOnce((seconds: number) =>
      mockPlayerProps?.onProgress?.(progressEvent(seconds)),
    );
    await act(async () => {
      await mockSyncPlayer?.seek(288000000);
    });
    expect(mockPlayer.seekTo).toHaveBeenCalledWith(28.8);
    expect(mockSyncPlayer?.getState().positionTicks).toBe(288000000);
    expect(mockReportProgress).toHaveBeenCalledTimes(1);
    expect(mockReportProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        PositionTicks: 288000000,
        IsPaused: true,
      }),
    );
    expect(mockSyncPlay.requestSeek).not.toHaveBeenCalled();
  });

  test("a group seek reports when the decoder reaches the 500 ms tolerance boundary", async () => {
    mockSyncPlay.enabled = true;
    await openPlayer();
    await tick(1200);
    mockReportProgress.mockClear();
    await act(async () => {
      await mockSyncPlayer?.seek(420000000);
    });
    await tick(41.499);
    expect(mockReportProgress).not.toHaveBeenCalled();
    await tick(41.5);
    expect(mockReportProgress).toHaveBeenCalledTimes(1);
    expect(mockReportProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        PositionTicks: 415000000,
        IsPaused: true,
      }),
    );
  });

  test("leaving and rejoining clears an unfinished group seek report", async () => {
    mockSyncPlay.enabled = true;
    await openPlayer();
    await tick(1200);
    await act(async () => {
      await mockSyncPlayer?.seek(420000000);
    });
    mockSyncPlay.enabled = false;
    await screen.rerender(<DirectPlayerPage />);
    mockSyncPlay.enabled = true;
    await screen.rerender(<DirectPlayerPage />);
    mockReportProgress.mockClear();
    await tick(42);
    expect(mockReportProgress).not.toHaveBeenCalled();
  });

  // Jellyfin clears the resume point of an item stopped below its minimum
  // resume percentage, so a stop at 0 for a session that never played wiped
  // 19 minutes of progress.
  test("keeps the resume point when the player is left before MPV reports a position", async () => {
    await openPlayer();
    await leavePlayer();

    expect(stopReports()[0]).toMatchObject({
      ItemId: "item-1",
      PlaySessionId: "session-item-1",
      PositionTicks: RESUME_TICKS,
    });
  });

  // The view ticks as soon as the duration is known. Before the renderer
  // seeded its position cache from the start position that tick said 0:00,
  // and a tick at 0 can still be the first thing an engine reports.
  test("keeps the resume point when the only tick so far is the one MPV sends before it has a position", async () => {
    await openPlayer();
    await tick(0);
    await leavePlayer();

    expect(stopReports()[0].PositionTicks).toBe(RESUME_TICKS);
  });

  // A progress report at 0 clears the resume point just like a stop at 0, and
  // the position written to the route is what the player restarts from.
  test("does not report that tick as progress or write it to the route", async () => {
    await openPlayer();
    await tick(0);

    expect(mockReportProgress).not.toHaveBeenCalled();
    expect(mockRouter.setParams).not.toHaveBeenCalledWith({
      playbackPosition: "0",
    });
  });

  // On Android the view announces playing as soon as it is created, long
  // before a frame, and that announcement is reported as progress.
  test("reports the start position when playing is announced before MPV has a position", async () => {
    await openPlayer();
    await announcePlaying();

    expect(mockReportProgress).toHaveBeenCalledTimes(1);
    expect(mockReportProgress).toHaveBeenCalledWith(
      expect.objectContaining({ PositionTicks: RESUME_TICKS }),
    );
  });

  // The route's position is what a re-negotiated stream starts from.
  test("writes the start position to the route when the player is left before MPV has a position", async () => {
    await openPlayer();
    await leavePlayer();

    expect(mockRouter.setParams).toHaveBeenCalledWith({
      playbackPosition: String(RESUME_TICKS),
    });
  });

  // After a stream is re-negotiated mid-playback the controls seed the
  // scrubber with the item's stored resume point, which is older than the
  // position the new stream starts from.
  test("does not take what the controls seeded for the scrubber as the position", async () => {
    await openPlayer();
    mockControlsProps?.progress.set(60_000);
    await tick(0);
    await leavePlayer();

    expect(stopReports()[0].PositionTicks).toBe(RESUME_TICKS);
  });

  // The tick such a seek produces is at 0 too, and nothing follows it while
  // the player is paused.
  test("reports a seek to the start made before MPV has a position", async () => {
    await openPlayer();
    await act(async () => mockControlsProps?.seek(0));
    await tick(0);
    await leavePlayer();

    expect(stopReports()[0].PositionTicks).toBe(0);
  });

  test("reports where a seek made before MPV has a position went", async () => {
    await openPlayer();
    await act(async () => mockControlsProps?.seek(600_000));
    await leavePlayer();

    expect(stopReports()[0].PositionTicks).toBe(6_000_000_000);
  });

  test("reports where playback is once MPV has reported a position", async () => {
    await openPlayer();
    await tick(0);
    await tick(1200);
    await leavePlayer();

    expect(stopReports()[0].PositionTicks).toBe(12_000_000_000);
  });

  test("reports a seek back to the start once playback has a position", async () => {
    await openPlayer();
    await tick(1200);
    await tick(0);
    await leavePlayer();

    expect(stopReports()[0].PositionTicks).toBe(0);
  });

  // A stream refetch takes the MPV view off screen and puts a new one back,
  // which loads from the route's position and ticks at 0 again. A downloaded
  // file and a remote path keep the same URL across that refetch.
  test("keeps the position when the stream is refetched and comes back with the same URL", async () => {
    await openPlayer();
    await tick(1200);

    mockParams.bitrateValue = "8000000";
    try {
      await screen.rerender(<DirectPlayerPage />);
      await waitFor(() => expect(mockPlayerMounts).toBe(2));
      await tick(0);
      await leavePlayer();

      // The route still says where this spec opened the player, and that is
      // where the new view starts.
      expect(stopReports()[0].PositionTicks).toBe(RESUME_TICKS);
    } finally {
      mockParams.bitrateValue = "";
    }
  });

  // Episode list, next episode: the page stays mounted and the route's item
  // changes under it.
  test("closes the outgoing episode at its position and starts the next one at its own", async () => {
    await openPlayer();
    await tick(1200);

    mockParams.itemId = "item-2";
    mockParams.playbackPosition = "";
    try {
      await screen.rerender(<DirectPlayerPage />);
      await waitFor(() => expect(mockPlayerMounts).toBe(2));
      await waitFor(() => expect(startReports()).toHaveLength(2));

      expect(stopReports()).toEqual([
        expect.objectContaining({
          ItemId: "item-1",
          PlaySessionId: "session-item-1",
          PositionTicks: 12_000_000_000,
        }),
      ]);

      await tick(0);
      await act(async () => {
        mockListeners.beforeRemove?.();
      });
      await waitFor(() => expect(stopReports()).toHaveLength(2));

      expect(stopReports()[1]).toMatchObject({
        ItemId: "item-2",
        PlaySessionId: "session-item-2",
        PositionTicks: NEXT_RESUME_TICKS,
      });
    } finally {
      mockParams.itemId = "item-1";
      mockParams.playbackPosition = String(RESUME_TICKS);
    }
  });

  describe("on TV, where the controls re-negotiate the stream through the page", () => {
    beforeEach(() => stubReactNative({ isTV: true }));
    afterEach(() => stubReactNative());

    test("restarts from the start position when the bitrate changes before MPV has a position", async () => {
      await openPlayer();
      await act(async () => mockControlsProps?.onBitrateChange?.(4_000_000));

      expect(restartPosition()).toBe(String(RESUME_TICKS));
    });

    test("restarts from the start position when the audio track of a transcode changes before MPV has a position", async () => {
      mockTranscodingUrl = "/videos/item-1/master.m3u8";
      await openPlayer();
      await act(async () => mockControlsProps?.onAudioIndexChange?.(2));

      expect(restartPosition()).toBe(String(RESUME_TICKS));
    });

    test("restarts from where playback is once MPV has reported a position", async () => {
      await openPlayer();
      await tick(1200);
      await act(async () => mockControlsProps?.onBitrateChange?.(4_000_000));

      expect(restartPosition()).toBe("12000000000");
    });
  });

  // What a top shelf play link or a remote Play command opens the route with.
  test("resumes at the item's stored position when the route carries none", async () => {
    mockParams.playbackPosition = "";
    try {
      await openPlayer();
      expect(mockPlayerProps?.source?.startPosition).toBe(1158);

      await tick(0);
      await leavePlayer();

      expect(stopReports()[0].PositionTicks).toBe(RESUME_TICKS);
    } finally {
      mockParams.playbackPosition = String(RESUME_TICKS);
    }
  });

  // One report every ten seconds and one route write every thirty were held
  // to by a time kept in a shared value, written by one tick and read by the
  // next. Ticks queued behind a busy JS thread are handled back to back, and
  // none of them sees what the one before wrote. That reading of the library
  // fits the breadcrumbs of one Android session (Sentry REACT-NATIVE-A7 and
  // REACT-NATIVE-81): 14 to 24 progress reports and 15 to 18 route writes
  // within milliseconds. It was not reproduced on a device.
  describe("when the ticks of a held up JS thread arrive together", () => {
    test("reports progress once and writes the route once when both are due", async () => {
      await openPlayer();
      await tick(1200);
      mockReportProgress.mockClear();
      mockRouter.setParams.mockClear();

      await pileUp([1231, 1232, 1233, 1234, 1235], Date.now() + 31_000);

      expect(mockReportProgress).toHaveBeenCalledTimes(1);
      expect(mockRouter.setParams).toHaveBeenCalledTimes(1);
    });

    // The end of a seek is reported and written at once, whatever the
    // intervals say, and the mark that asks for it was a shared value too.
    test("reports the end of a seek once", async () => {
      await openPlayer();
      await tick(1200);
      mockReportProgress.mockClear();
      mockRouter.setParams.mockClear();

      await act(async () => mockSeekReaction?.(false, true));
      await pileUp([600, 601, 602]);

      expect(mockReportProgress).toHaveBeenCalledTimes(1);
      expect(mockRouter.setParams).toHaveBeenCalledTimes(1);
    });

    test("leaves ticks that are not due alone", async () => {
      await openPlayer();
      await tick(1200);
      mockReportProgress.mockClear();
      mockRouter.setParams.mockClear();

      await pileUp([1201, 1202, 1203]);

      expect(mockReportProgress).not.toHaveBeenCalled();
      expect(mockRouter.setParams).not.toHaveBeenCalled();
    });
  });

  test("reports 0 for an item that starts at the beginning", async () => {
    mockParams.playbackPosition = "0";
    try {
      await openPlayer();
      await tick(0);
      await leavePlayer();

      expect(stopReports()[0].PositionTicks).toBe(0);
    } finally {
      mockParams.playbackPosition = String(RESUME_TICKS);
    }
  });
});
