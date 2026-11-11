import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client/models";
import { act, render, waitFor } from "@testing-library/react-native";
import { Controls } from "@/components/video-player/controls/Controls";
import { JotaiQueryWrapper } from "@/test-utils/queryWrapper";
import { makeSharedValue } from "@/test-utils/reanimated";

let mockParams: Record<string, string> = {};
const mockSetParams = jest.fn();
let mockNextItem: BaseItemDto | null = null;
let mockHeaderProps: any = null;
let mockOffline = true;
let mockDownloadedItem: {
  userData: {
    audioStreamIndex: number;
    subtitleStreamIndex: number;
    isTranscoded: boolean;
  };
} | null = null;
/** The downloads on disk, by item id: the next episode's own file and tracks. */
let mockDownloads: Record<string, unknown> = {};

// The native-module doubles test-utils/perfSetup.ts registers for the perf
// spec that renders Controls.
jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);
jest.mock("expo-notifications", () => ({
  scheduleNotificationAsync: jest.fn(),
}));
jest.mock("sonner-native", () => ({
  toast: { error: jest.fn(), success: jest.fn(), info: jest.fn() },
}));
jest.mock(
  "react-native-safe-area-context",
  () => jest.requireActual("react-native-safe-area-context/jest/mock").default,
);
jest.mock(
  "react-native-reanimated",
  () => jest.requireActual("@/test-utils/reanimated").reanimatedModule,
);
jest.mock("@gorhom/bottom-sheet", () =>
  jest.requireActual("@gorhom/bottom-sheet/mock"),
);
jest.mock(
  "@/providers/JellyfinProvider",
  () =>
    jest.requireActual("@/test-utils/jellyfinProvider").jellyfinProviderModule,
);
jest.mock(
  "@/utils/atoms/api",
  () => jest.requireActual("@/test-utils/jellyfinProvider").apiAtomsModule,
);
jest.mock(
  "expo-router/react-navigation",
  () => jest.requireActual("@/test-utils/expoRouter").reactNavigationModule,
);
jest.mock("@/modules", () => {
  const { viewStub } = jest.requireActual("@/test-utils/viewStub");
  return {
    HeroCarouselView: viewStub("hero-carousel"),
    isHeroCarouselAvailable: () => true,
    BackgroundDownloader: {
      addStartedListener: () => ({ remove: () => {} }),
      addProgressListener: () => ({ remove: () => {} }),
      addCompleteListener: () => ({ remove: () => {} }),
      addErrorListener: () => ({ remove: () => {} }),
      setLiveActivityEnabled: () => {},
    },
  };
});
jest.mock("react-i18next", () => ({
  ...jest.requireActual("react-i18next"),
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock("expo-router", () => ({
  ...jest.requireActual("@/test-utils/expoRouter").expoRouterModule,
  useLocalSearchParams: () => mockParams,
}));
jest.mock("@/hooks/useAppRouter", () => ({
  __esModule: true,
  default: () => ({
    setParams: mockSetParams,
    replace: jest.fn(),
    push: jest.fn(),
    back: jest.fn(),
  }),
}));
jest.mock("@/providers/OfflineModeProvider", () => ({
  useOfflineMode: () => mockOffline,
}));
jest.mock("@/hooks/usePlaybackManager", () => ({
  usePlaybackManager: () => ({
    nextItem: mockNextItem,
    previousItem: null,
    reportPlaybackProgress: jest.fn(),
    reportPlaybackStopped: jest.fn(),
  }),
}));
jest.mock("@/hooks/useServerVersion", () => ({
  useServerVersion: () => undefined,
}));
// Only to get hold of the next-episode handler Controls builds; the handler
// itself (goToNextItem -> goToItemByUser/goToItemCommon) stays real.
jest.mock("@/components/video-player/controls/HeaderControls", () => ({
  HeaderControls: (props: any) => {
    mockHeaderProps = props;
    return null;
  },
}));
// Same doubles as Controls.perf-test.tsx.
jest.mock(
  "expo-key-event",
  () => jest.requireActual("@/test-utils/playerControlsNative").keyEventModule,
);
jest.mock(
  "react-native-awesome-slider",
  () => jest.requireActual("@/test-utils/playerControlsNative").sliderModule,
);
jest.mock("@/components/video-player/controls/contexts/VideoContext", () => ({
  useVideoContext: () => ({ subtitleTracks: [], audioTracks: [] }),
}));
jest.mock("@/components/video-player/controls/contexts/PlayerContext", () => ({
  usePlayerContext: () => ({
    playerRef: { current: null },
    item: {},
    mediaSource: null,
    isVideoLoaded: true,
    tracksReady: true,
    downloadedItem: mockDownloadedItem,
  }),
  usePlayerControls: () => ({
    getSubtitleTracks: async () => null,
    getAudioTracks: async () => null,
    setSubtitleTrack: () => {},
    setAudioTrack: () => {},
    disableSubtitles: () => {},
  }),
}));
jest.mock(
  "@/providers/NetworkStatusProvider",
  () => jest.requireActual("@/test-utils/appProviders").networkStatusModule,
);
jest.mock("@/providers/DownloadProvider", () => ({
  useDownload: () => ({
    ...jest
      .requireActual("@/test-utils/appProviders")
      .downloadModule.useDownload(),
    getDownloadedItemById: (id: string) => mockDownloads[id],
  }),
}));
jest.mock(
  "@/providers/GlobalModalProvider",
  () => jest.requireActual("@/test-utils/appProviders").globalModalModule,
);
jest.mock("@/hooks/useOrientation", () => ({
  useOrientation: () => ({ isLandscape: false, orientation: 1 }),
}));

const RUNTIME = 1440 * 10_000_000;
const video = { Type: "Video" as const, Index: 0, Codec: "h264" };
const audio = {
  Type: "Audio" as const,
  Index: 1,
  Language: "eng",
  Codec: "aac",
};
const subtitle = (Index: number, Language: string) => ({
  Type: "Subtitle" as const,
  Index,
  Language,
  Codec: "subrip",
  DisplayTitle: `${Language} - SUBRIP`,
});
// One release of a show: every episode has the same tracks, subtitles off by
// default.
const release = (Id: string): MediaSourceInfo => ({
  Id,
  Name: "1080p",
  DefaultAudioStreamIndex: 1,
  DefaultSubtitleStreamIndex: -1,
  MediaStreams: [video, audio, subtitle(2, "eng"), subtitle(3, "fre")],
});
const episode = (Id: string): BaseItemDto => ({
  Id,
  Name: Id,
  Type: "Episode",
  SeriesId: "series-1",
  RunTimeTicks: RUNTIME,
  MediaSources: [release(`${Id}-source`)],
});

const advanceFrom = async (route: Record<string, string>) => {
  mockParams = {
    itemId: "ep1",
    bitrateValue: "",
    playbackPosition: "",
    ...route,
  };
  mockHeaderProps = null;
  await render(
    <Controls
      item={episode("ep1") as any}
      mediaSource={release("ep1-source") as any}
      isPlaying={true}
      isBuffering={false}
      showControls={true}
      setShowControls={() => {}}
      togglePlay={() => {}}
      play={() => {}}
      pause={() => {}}
      seek={() => {}}
      progress={makeSharedValue(60_000) as any}
      isSeeking={makeSharedValue(false) as any}
      cacheProgress={makeSharedValue(0) as any}
    />,
    { wrapper: JotaiQueryWrapper },
  );
  await waitFor(() => expect(mockHeaderProps?.nextItem).toBeTruthy());
  mockSetParams.mockClear();
  await act(async () => {
    mockHeaderProps.goToNextItem({ isAutoPlay: true });
  });
  return mockSetParams.mock.calls[0]?.[0] as Record<string, string>;
};

beforeEach(() => {
  mockOffline = true;
  mockDownloadedItem = null;
  mockDownloads = {};
  mockNextItem = episode("ep2");
});

describe("Controls, moving to the next episode", () => {
  // A download opens with no track in its route: the record says which ones
  // play, and the player shows them. The next episode was handed the route's
  // blank instead, and played without the subtitles the viewer had on.
  test("carries the subtitle a download plays on to the next one", async () => {
    mockDownloadedItem = {
      userData: {
        audioStreamIndex: 1,
        subtitleStreamIndex: 3,
        isTranscoded: false,
      },
    };

    const next = await advanceFrom({
      offline: "true",
      audioIndex: "",
      subtitleIndex: "",
    });

    expect(next).toEqual(
      expect.objectContaining({ itemId: "ep2", subtitleIndex: "3" }),
    );
  });

  test("carries a track picked in the route over the download's", async () => {
    mockDownloadedItem = {
      userData: {
        audioStreamIndex: 1,
        subtitleStreamIndex: 3,
        isTranscoded: false,
      },
    };

    const next = await advanceFrom({
      offline: "true",
      audioIndex: "1",
      subtitleIndex: "-1",
    });

    expect(next).toEqual(
      expect.objectContaining({ itemId: "ep2", subtitleIndex: "-1" }),
    );
  });

  // Online, a blank route is no selection to carry: the next episode starts
  // on its own default.
  test("carries nothing from a blank route online", async () => {
    mockOffline = false;
    mockNextItem = {
      ...episode("ep2"),
      MediaSources: [
        { ...release("ep2-source"), DefaultSubtitleStreamIndex: 2 },
      ],
    };

    const next = await advanceFrom({ audioIndex: "", subtitleIndex: "" });

    expect(next).toEqual(
      expect.objectContaining({ itemId: "ep2", subtitleIndex: "2" }),
    );
  });
  // The next episode was downloaded as the second server version, a remux
  // with an extra audio track: its subtitles are numbered one higher than on
  // the first version, which the carry-over used to be resolved against.
  describe("when the next download is another version", () => {
    const remux: MediaSourceInfo = {
      Id: "ep2-remux",
      Name: "2160p",
      DefaultAudioStreamIndex: 1,
      DefaultSubtitleStreamIndex: -1,
      MediaStreams: [
        video,
        audio,
        { ...audio, Index: 2, Codec: "truehd" },
        subtitle(3, "eng"),
        subtitle(4, "fre"),
      ],
    };

    beforeEach(() => {
      mockNextItem = {
        ...episode("ep2"),
        MediaSources: [release("ep2-source"), remux],
      };
    });

    test("resolves the carry-over on the file it plays", async () => {
      mockDownloadedItem = {
        userData: {
          audioStreamIndex: 1,
          subtitleStreamIndex: 3,
          isTranscoded: false,
        },
      };
      mockDownloads = {
        ep2: {
          mediaSource: remux,
          userData: {
            audioStreamIndex: 1,
            subtitleStreamIndex: 3,
            isTranscoded: false,
          },
        },
      };

      const next = await advanceFrom({
        offline: "true",
        audioIndex: "",
        subtitleIndex: "",
      });

      expect(next).toEqual(
        expect.objectContaining({
          mediaSourceId: "ep2-remux",
          subtitleIndex: "4",
        }),
      );
    });

    // Nothing names the episode playing's tracks, so nothing carries over:
    // the file plays the tracks its download recorded.
    test("keeps the tracks the download recorded when nothing carries over", async () => {
      mockDownloads = {
        ep2: {
          mediaSource: remux,
          userData: {
            audioStreamIndex: 2,
            subtitleStreamIndex: 4,
            isTranscoded: false,
          },
        },
      };

      const next = await advanceFrom({
        offline: "true",
        audioIndex: "",
        subtitleIndex: "",
      });

      expect(next).toEqual(
        expect.objectContaining({
          mediaSourceId: "ep2-remux",
          audioIndex: "2",
          subtitleIndex: "4",
        }),
      );
    });
  });
});
