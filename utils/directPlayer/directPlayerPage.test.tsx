// Spec for app/(auth)/player/direct-player.tsx. It lives here rather than next
// to the page because Expo Router turns every file under app/ into a route.
import { act, render, screen, waitFor } from "@testing-library/react-native";
import i18next from "i18next";
import DirectPlayerPage from "@/app/(auth)/player/direct-player";
import type { MpvPlayerViewProps } from "@/modules";
import type { makeApi } from "@/test-utils/jellyfinApi";
import { stubReactNative } from "@/test-utils/reactNative";
import {
  holdSharedValueWrites,
  releaseSharedValueWrites,
} from "@/test-utils/reanimated";

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
type MockRemoval = (options: {
  data: { action: { type: string } };
  repeat: () => void;
}) => void;
// What the page last passed to usePreventRemove: whether it holds a removal,
// and what it does with one.
let mockPreventRemove: { held: boolean; onRemove?: MockRemoval } = {
  held: false,
};
const mockRepeat = jest.fn();
const mockRouter = { setParams: jest.fn(), replace: jest.fn() };
const mockReportProgress = jest.fn(async (_info: unknown) => {});
const mockPlayer = {
  destroy: jest.fn(async () => {}),
  seekTo: jest.fn(),
  play: jest.fn(),
  pause: jest.fn(async () => {}),
  setSpeed: jest.fn(async () => {}),
  // The embedded subtitles of the file, as MPV lists them.
  getSubtitleTracks: jest.fn(async () => [
    { id: 1, lang: "eng", title: "English", codec: "subrip", external: false },
    { id: 2, lang: "fre", title: "French", codec: "subrip", external: false },
  ]),
  setSubtitleTrack: jest.fn(async (_id: number) => {}),
  disableSubtitles: jest.fn(async () => {}),
};
let mockPlayerProps: MpvPlayerViewProps | null = null;
/** How many MPV views have mounted: each one loads its source from scratch. */
let mockPlayerMounts = 0;
/** What the page handed the controls: the shared position and its handlers. */
type ControlsProps = {
  progress: { get: () => number; set: (ms: number) => void };
  seek: (ms: number) => void;
  onBitrateChange?: (bitrate: number | undefined) => void;
  onAudioIndexChange?: (index: number) => void;
  onSubtitleIndexChange?: (index: number) => void;
};
let mockControlsProps: ControlsProps | null = null;
/** What the page does when the seeking flag changes, to run by hand: the
 * reaction itself lives on the UI thread, which a spec does not have. */
let mockSeekReaction:
  | ((seeking: boolean, wasSeeking: boolean | null) => void)
  | null = null;
/** Set to have the server answer with a transcode instead of a direct stream. */
let mockTranscodingUrl: string | undefined;
/** Holds the next stream negotiation until `release` is called. */
const mockStreamHold: {
  held: boolean;
  release?: () => void;
  liveStreamId?: string;
} = { held: false };
/** The max streaming bitrate of each stream the page asked the server for. */
const mockAskedBitrates: (number | undefined)[] = [];
const mockSettings: { defaultBitrate?: { key: string; value?: number } } = {};
let mockDownloads: Record<string, unknown> = {};
const mockNoop = () => {};
/** The volume commands the page handed the session socket. */
let mockSocketCommands: {
  volumeUp?: () => Promise<void>;
  volumeDown?: () => Promise<void>;
} = {};
/** What the page did with the device volume: reads and writes, in order. */
const mockVolumeCalls: string[] = [];

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams,
  usePreventRemove: (held: boolean, onRemove?: MockRemoval) => {
    mockPreventRemove = { held, onRemove };
    return () => {};
  },
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
    getDownloadedItemById: (id: string) => mockDownloads[id],
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
jest.mock("@/hooks/useWebsockets", () => ({
  useWebSocket: (commands: typeof mockSocketCommands) => {
    mockSocketCommands = commands;
  },
}));
jest.mock("@/modules/system-volume", () => ({
  ...jest.requireActual("@/modules/system-volume"),
  getSystemVolume: () => {
    mockVolumeCalls.push("sync read");
    return 0.4;
  },
  getSystemVolumeAsync: async () => {
    mockVolumeCalls.push("async read");
    return 0.4;
  },
  setSystemVolume: (volume: number) => {
    mockVolumeCalls.push(`set ${volume.toFixed(2)}`);
  },
}));
// Where an alternate version starts is covered by
// getDefaultPlaySettings.test.ts; the version itself is not under test here.
jest.mock("@/hooks/useServerVersion", () => ({
  useServerVersion: () => "12.0.0",
}));
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
  getStreamUrl: async ({
    item,
    maxStreamingBitrate,
  }: {
    item: { Id: string };
    maxStreamingBitrate?: number;
  }) => {
    mockAskedBitrates.push(maxStreamingBitrate);
    if (mockStreamHold.held) {
      await new Promise<void>((resolve) => (mockStreamHold.release = resolve));
    }
    return {
      mediaSource: {
        Id: "source-1",
        MediaStreams: [],
        TranscodingUrl: mockTranscodingUrl,
        LiveStreamId: mockStreamHold.liveStreamId,
      },
      sessionId: `session-${item.Id}`,
      url: `https://jellyfin.example.com/Videos/${item.Id}/stream.mkv`,
    };
  },
}));
jest.mock("@/utils/jellyfin/bitrateTest", () => ({
  detectBitrate: async () => 12_000_000,
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

/**
 * Hardware back, the header button and a swipe all arrive as a removal, which
 * the page holds through usePreventRemove until it has stopped.
 */
const removePlayer = async () => {
  await act(async () => {
    if (mockPreventRemove.held) {
      mockPreventRemove.onRemove?.({
        data: { action: { type: "GO_BACK" } },
        repeat: mockRepeat,
      });
    }
  });
};

const leavePlayer = async () => {
  await removePlayer();
  await waitFor(() => expect(stopReports()).toHaveLength(1));
};

// The language the stream headers carry, the same for every test.
beforeAll(() => i18next.init({ lng: "sv", resources: {} }));

describe("direct player stop report", () => {
  beforeEach(() => {
    // The page logs each stream fetch it skips while the item is loading.
    jest.spyOn(console, "log").mockImplementation(() => {});
    mockPlayerProps = null;
    mockPlayerMounts = 0;
    mockControlsProps = null;
    mockSeekReaction = null;
    mockTranscodingUrl = undefined;
    mockRouter.setParams.mockClear();
    mockRouter.replace.mockClear();
    mockReportProgress.mockClear();
    mockPlayer.destroy.mockClear();
    mockRepeat.mockClear();
    mockPreventRemove = { held: false };
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

  // Expo Router 58 has no beforeRemove: the page holds the removal, stops, and
  // only then lets it through, so the old decoder is gone before the next
  // screen mounts.
  test("destroys the player before letting the removal through, and holds no later one", async () => {
    await openPlayer();
    await leavePlayer();

    expect(mockRepeat).toHaveBeenCalledTimes(1);
    expect(mockPlayer.destroy.mock.invocationCallOrder[0]).toBeLessThan(
      mockRepeat.mock.invocationCallOrder[0],
    );
    expect(mockPreventRemove.held).toBe(false);
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
      await removePlayer();
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

  test("asks the server for the app language on the stream", async () => {
    // A Jellyfin 12 server localizes what it answers from this header. One
    // tag and no list: mpv takes its headers comma separated.
    await openPlayer();

    expect(mockPlayerProps?.source?.headers).toEqual({
      "Accept-Language": "sv",
      Authorization: 'MediaBrowser Token="SECRET_TOKEN"',
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

  // The synchronous read is a round trip to the audio server on iOS, which
  // can hold the JS thread for seconds in the middle of playback.
  test("reads the volume off the JS thread for a remote volume step", async () => {
    await openPlayer();
    mockVolumeCalls.length = 0;

    await act(async () => {
      await mockSocketCommands.volumeDown?.();
    });

    expect(mockVolumeCalls).toEqual(["async read", "set 0.30"]);
  });

  // Two commands sent back to back both read the volume before the first one
  // landed, and the second one added nothing.
  test("makes two steps of two volume commands sent back to back", async () => {
    await openPlayer();
    mockVolumeCalls.length = 0;

    await act(async () => {
      await Promise.all([
        mockSocketCommands.volumeUp?.(),
        mockSocketCommands.volumeUp?.(),
      ]);
    });

    expect(mockVolumeCalls).toEqual(["async read", "set 0.50", "set 0.60"]);
  });
});

describe("direct player subtitles", () => {
  beforeEach(() => {
    jest.spyOn(console, "log").mockImplementation(() => {});
    mockPlayer.setSubtitleTrack.mockClear();
    mockPlayer.disableSubtitles.mockClear();
    const embedded = (Index: number, Language: string) => ({
      Type: "Subtitle",
      Index,
      Language,
      Codec: "subrip",
      IsTextSubtitleStream: true,
      DeliveryMethod: "Embed",
    });
    mockDownloads = {
      "item-1": {
        item: { Id: "item-1", Type: "Episode", RunTimeTicks: RUNTIME_TICKS },
        mediaSource: {
          Id: "source-1",
          MediaStreams: [
            { Type: "Video", Index: 0 },
            { Type: "Audio", Index: 1, Language: "eng" },
            embedded(2, "eng"),
            embedded(3, "fre"),
          ],
        },
        videoFilePath: "file:///downloads/item-1.mkv",
        userData: {
          audioStreamIndex: 1,
          subtitleStreamIndex: 3,
          isTranscoded: false,
        },
      },
    };
    mockParams.offline = "true";
  });

  afterEach(() => {
    mockDownloads = {};
    mockParams.offline = "false";
    mockParams.subtitleIndex = "";
  });

  /** Opens the player and lets MPV announce its track list. */
  const openWithTracks = async () => {
    await render(<DirectPlayerPage />);
    await waitFor(() => expect(screen.getByTestId("mpv-view")).toBeTruthy());
    await act(async () => {
      mockPlayerProps?.onTracksReady?.({ nativeEvent: {} } as Parameters<
        NonNullable<MpvPlayerViewProps["onTracksReady"]>
      >[0]);
    });
  };

  // French is the second embedded subtitle of the file, so MPV's track 2.
  test("starts a download on the subtitle it was downloaded with", async () => {
    await openWithTracks();

    await waitFor(() =>
      expect(mockPlayer.setSubtitleTrack).toHaveBeenLastCalledWith(2),
    );
  });

  test("starts a download on the subtitle the route asks for", async () => {
    mockParams.subtitleIndex = "-1";
    await openWithTracks();

    await waitFor(() => expect(mockPlayer.disableSubtitles).toHaveBeenCalled());
    expect(mockPlayer.setSubtitleTrack).not.toHaveBeenCalled();
  });
});

describe("direct player quality", () => {
  beforeEach(() => {
    jest.spyOn(console, "log").mockImplementation(() => {});
    mockAskedBitrates.length = 0;
    api.mock.reset();
    api.mock.onGet(/\/Items\/item-1/).reply(200, {
      Id: "item-1",
      Type: "Movie",
      RunTimeTicks: RUNTIME_TICKS,
    });
    api.mock.onPost(/\/Sessions\/Playing/).reply(204);
  });

  afterEach(async () => {
    screen.unmount();
    await waitFor(() => expect(stopReports()).toHaveLength(1));
    mockParams.bitrateValue = "";
    delete mockSettings.defaultBitrate;
    jest.restoreAllMocks();
  });

  test("asks the server for what Auto measures", async () => {
    mockParams.bitrateValue = "auto";

    await openPlayer();

    expect(mockAskedBitrates).toEqual([12_000_000]);
  });

  // What Live TV asks for, whatever the default quality.
  test("asks for no cap under Max", async () => {
    mockSettings.defaultBitrate = { key: "8 Mb/s", value: 8_000_000 };
    mockParams.bitrateValue = "max";

    await openPlayer();

    expect(mockAskedBitrates).toEqual([undefined]);
  });

  // A Play command from another client, or a Top Shelf or TV recommendation
  // tile where the native player is off, opens the route with no quality.
  test("asks for the default quality when the route names none", async () => {
    mockSettings.defaultBitrate = { key: "8 Mb/s", value: 8_000_000 };

    await openPlayer();

    expect(mockAskedBitrates).toEqual([8_000_000]);
  });

  test("measures the default quality when it is Auto", async () => {
    mockSettings.defaultBitrate = { key: "Auto", value: undefined };

    await openPlayer();

    expect(mockAskedBitrates).toEqual([12_000_000]);
  });

  test("asks for a fixed quality as it is", async () => {
    mockParams.bitrateValue = "8000000";

    await openPlayer();

    expect(mockAskedBitrates).toEqual([8_000_000]);
  });

  // A Play command from another client opens a channel with no quality: it
  // played at the default, where every other way in plays it uncapped.
  test("asks for no cap for live television whose route names no quality", async () => {
    mockSettings.defaultBitrate = { key: "8 Mb/s", value: 8_000_000 };
    api.mock.onGet(/\/Items\/item-1/).reply(200, {
      Id: "item-1",
      Type: "TvChannel",
    });

    await openPlayer();

    expect(mockAskedBitrates).toEqual([undefined]);
  });

  // On TV a track change asks the route for another stream: it named the
  // default quality there, and the live channel came back capped at it.
  test("keeps live television uncapped when a track change asks for another stream", async () => {
    stubReactNative({ isTV: true });
    mockSettings.defaultBitrate = { key: "8 Mb/s", value: 8_000_000 };
    api.mock.onGet(/\/Items\/item-1/).reply(200, {
      Id: "item-1",
      Type: "TvChannel",
    });
    mockRouter.replace.mockClear();
    try {
      await openPlayer();
      await act(async () => mockControlsProps?.onSubtitleIndexChange?.(3));
    } finally {
      stubReactNative();
    }

    expect(mockRouter.replace).toHaveBeenCalledTimes(1);
    const [href] = mockRouter.replace.mock.calls[0];
    expect(
      new URLSearchParams(String(href).split("?")[1]).get("bitrateValue"),
    ).toBe("max");
  });

  // The audio track of a transcode needs another stream too, asked the same way.
  test("keeps live television uncapped when its audio track asks for another stream", async () => {
    stubReactNative({ isTV: true });
    mockTranscodingUrl = "/videos/item-1/master.m3u8";
    mockSettings.defaultBitrate = { key: "8 Mb/s", value: 8_000_000 };
    api.mock.onGet(/\/Items\/item-1/).reply(200, {
      Id: "item-1",
      Type: "TvChannel",
    });
    mockRouter.replace.mockClear();
    try {
      await openPlayer();
      await act(async () => mockControlsProps?.onAudioIndexChange?.(2));
    } finally {
      stubReactNative();
      mockTranscodingUrl = undefined;
    }

    expect(mockRouter.replace).toHaveBeenCalledTimes(1);
    const [href] = mockRouter.replace.mock.calls[0];
    expect(
      new URLSearchParams(String(href).split("?")[1]).get("bitrateValue"),
    ).toBe("max");
  });
});

describe("a player left while its stream is negotiated", () => {
  beforeEach(() => {
    jest.spyOn(console, "log").mockImplementation(() => {});
    api.mock.reset();
    api.mock.onGet(/\/Items\/item-1/).reply(200, {
      Id: "item-1",
      Type: "TvChannel",
    });
    api.mock.onPost().reply(204);
    mockStreamHold.held = true;
    mockStreamHold.liveStreamId = "live-1";
  });

  afterEach(() => {
    mockStreamHold.held = false;
    mockStreamHold.release = undefined;
    mockStreamHold.liveStreamId = undefined;
    jest.restoreAllMocks();
  });

  // The live stream the server opened for it came back after the page was
  // gone: nothing closed it, and it held its tuner until the server reaped it.
  test("closes the live stream that comes back after it", async () => {
    await render(<DirectPlayerPage />);
    await waitFor(() => expect(mockStreamHold.release).toBeDefined());
    screen.unmount();

    await act(async () => mockStreamHold.release?.());

    await waitFor(() =>
      expect(
        api.mock.history.post.map((request) => request.url ?? ""),
      ).toContainEqual(
        expect.stringContaining("/LiveStreams/Close?liveStreamId=live-1"),
      ),
    );
    expect(startReports()).toHaveLength(0);
  });
});
