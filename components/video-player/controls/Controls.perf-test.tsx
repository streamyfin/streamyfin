import { act, screen } from "@testing-library/react-native";
import { useState } from "react";
import { measureRenders } from "reassure";
import { Controls } from "@/components/video-player/controls/Controls";
import { JotaiQueryWrapper } from "@/test-utils/queryWrapper";
import { makeSharedValue } from "@/test-utils/reanimated";

jest.mock(
  "expo-key-event",
  () => jest.requireActual("@/test-utils/playerControlsNative").keyEventModule,
);
jest.mock(
  "react-native-volume-manager",
  () =>
    jest.requireActual("@/test-utils/playerControlsNative").volumeManagerModule,
);
jest.mock(
  "react-native-awesome-slider",
  () => jest.requireActual("@/test-utils/playerControlsNative").sliderModule,
);
// The player view and its tracks are native; the controls only read them.
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
    downloadedItem: null,
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
jest.mock(
  "@/providers/DownloadProvider",
  () => jest.requireActual("@/test-utils/appProviders").downloadModule,
);
jest.mock(
  "@/providers/GlobalModalProvider",
  () => jest.requireActual("@/test-utils/appProviders").globalModalModule,
);
jest.mock("@/hooks/useOrientation", () => ({
  useOrientation: () => ({ isLandscape: false, orientation: 1 }),
}));

const item = {
  Id: "movie-1",
  Name: "Test Movie",
  Type: "Movie",
  RunTimeTicks: 7200 * 10_000_000, // 2 hours
};

const mediaSource = {
  Id: "source-1",
  RunTimeTicks: 7200 * 10_000_000,
  Bitrate: 10_000_000,
  Container: "mkv",
  MediaStreams: [{ Type: "Video", Codec: "hevc" }],
};

let testSetShowControls:
  | ((v: boolean | ((prev: boolean) => boolean)) => void)
  | undefined;

const TestControls = ({
  progress,
  isSeeking,
  cacheProgress,
}: {
  progress: any;
  isSeeking: any;
  cacheProgress: any;
}) => {
  const [showControls, setShowControls] = useState(true);
  testSetShowControls = setShowControls;

  return (
    <Controls
      item={item as any}
      mediaSource={mediaSource as any}
      isPlaying={true}
      isBuffering={false}
      showControls={showControls}
      setShowControls={setShowControls}
      togglePlay={() => {}}
      play={() => {}}
      pause={() => {}}
      seek={() => {}}
      progress={progress}
      isSeeking={isSeeking}
      cacheProgress={cacheProgress}
    />
  );
};

// Fresh shared values for every run, so each run starts from 0 like the first.
let progress = makeSharedValue(0);
let isSeeking = makeSharedValue(false);
let cacheProgress = makeSharedValue(0);

const resetSharedValues = () => {
  progress = makeSharedValue(0);
  isSeeking = makeSharedValue(false);
  cacheProgress = makeSharedValue(0);
};

const ControlsWithFreshValues = () => (
  <TestControls
    progress={progress}
    isSeeking={isSeeking}
    cacheProgress={cacheProgress}
  />
);

describe("Video Player Controls Performance", () => {
  test("progress updates and controls toggles re-render the controls tree", async () => {
    await measureRenders(<ControlsWithFreshValues />, {
      wrapper: JotaiQueryWrapper,
      beforeEach: resetSharedValues,
      scenario: async () => {
        // Wait for controls to mount
        await screen.findByText("Test Movie");

        // Advance progress through 30 seconds of ticks
        for (let second = 1; second <= 30; second++) {
          await act(async () => {
            progress.value = second * 1000;
          });
        }

        // Toggle controls off and back on
        await act(async () => {
          testSetShowControls?.(false);
        });

        await act(async () => {
          testSetShowControls?.(true);
        });
      },
    });
  });
});
