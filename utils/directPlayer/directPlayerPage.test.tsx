// Spec for app/(auth)/player/direct-player.tsx. It lives here rather than next
// to the page because Expo Router turns every file under app/ into a route.
import { act, render, screen, waitFor } from "@testing-library/react-native";
import DirectPlayerPage from "@/app/(auth)/player/direct-player";
import type { MpvPlayerViewProps } from "@/modules";
import type { makeApi } from "@/test-utils/jellyfinApi";

/** 19m 18s, the resume position of the item in the bug report. */
const RESUME_TICKS = 11_580_000_000;
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
const mockSettings = {};
const mockNoop = () => {};

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams,
  useNavigation: () => mockNavigation,
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
// Reanimated's own Jest mock hands out a new shared value on every render,
// which re-runs every effect that depends on one. Keep one per component.
jest.mock("react-native-reanimated", () => {
  const { useRef } = jest.requireActual("react");
  return {
    useAnimatedReaction: () => {},
    useSharedValue: <T,>(initial: T) =>
      useRef({
        value: initial,
        get() {
          return this.value;
        },
        set(next: T) {
          this.value = next;
        },
      }).current,
  };
});
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
  getStreamUrl: async () => ({
    mediaSource: { Id: "source-1", MediaStreams: [] },
    sessionId: "play-session-1",
    url: "https://jellyfin.example.com/Videos/item-1/stream.mkv",
  }),
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
// controls happen to be mounted, so they are left out here.
jest.mock("@/components/video-player/controls/Controls", () => ({
  Controls: () => null,
}));
jest.mock("@/components/video-player/controls/Controls.tv", () => ({
  Controls: () => null,
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

/** Opens the player and waits until MPV has been handed the stream. */
const openPlayer = async () => {
  await render(<DirectPlayerPage />);
  await waitFor(() => expect(screen.getByTestId("mpv-view")).toBeTruthy());
  await waitFor(() =>
    expect(
      api.mock.history.post.some((request) =>
        request.url?.endsWith("/Sessions/Playing"),
      ),
    ).toBe(true),
  );
};

const tick = async (position: number) => {
  await act(async () => {
    await mockPlayerProps?.onProgress?.({
      nativeEvent: {
        position,
        duration: 3400,
        progress: position / 3400,
        cacheSeconds: 0,
      },
    } as Parameters<NonNullable<MpvPlayerViewProps["onProgress"]>>[0]);
  });
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
    // The page logs each stream fetch it skips while the item is loading.
    jest.spyOn(console, "log").mockImplementation(() => {});
    mockPlayerProps = null;
    mockPlayerMounts = 0;
    mockRouter.setParams.mockClear();
    mockReportProgress.mockClear();
    api.mock.reset();
    api.mock.onGet(/\/Items\/item-1/).reply(200, {
      Id: "item-1",
      Type: "Episode",
      RunTimeTicks: RUNTIME_TICKS,
      UserData: { PlaybackPositionTicks: RESUME_TICKS },
    });
    api.mock.onPost(/\/Sessions\/Playing/).reply(204);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // Jellyfin clears the resume point of an item stopped below its minimum
  // resume percentage, so a stop at 0 for a session that never played wiped
  // 19 minutes of progress.
  test("keeps the resume point when the player is left before MPV reports a position", async () => {
    await openPlayer();
    await leavePlayer();

    expect(stopReports()[0]).toMatchObject({
      ItemId: "item-1",
      PlaySessionId: "play-session-1",
      PositionTicks: RESUME_TICKS,
    });
  });

  // The MPV view emits a tick as soon as the duration is known, carrying its
  // unset position cache (0) until the first time-pos arrives.
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
