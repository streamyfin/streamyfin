import type { MediaSourceInfo } from "@jellyfin/sdk/lib/generated-client";
import { render, screen } from "@testing-library/react-native";
import type { TechnicalInfo } from "@/modules/mpv-player";
import { TechnicalInfoOverlay } from "./TechnicalInfoOverlay";

jest.mock("react-native-reanimated", () => {
  const { View } = jest.requireActual("react-native");
  return {
    ...jest.requireActual("@/test-utils/reanimated").reanimatedModule,
    __esModule: true,
    default: { View },
    Easing: { out: () => undefined, quad: undefined },
    useAnimatedStyle: (style: () => object) => style(),
    withTiming: (value: number) => value,
  };
});
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock("@/hooks/useControlsSafeAreaInsets", () => ({
  useControlsSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock("@/constants/TVTypography", () => ({
  useScaledTVTypography: () => ({ body: 20, callout: 18 }),
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const sourceWith = (
  frameRates: { ReferenceFrameRate?: number; AverageFrameRate?: number } = {},
): MediaSourceInfo => ({
  MediaStreams: [{ Type: "Video", ...frameRates }],
});

const renderOverlay = (
  info: TechnicalInfo,
  mediaSource: MediaSourceInfo,
  playMethod: "DirectPlay" | "DirectStream" | "Transcode" = "DirectPlay",
) =>
  render(
    <TechnicalInfoOverlay
      showControls
      visible
      getTechnicalInfo={async () => info}
      mediaSource={mediaSource}
      playMethod={playMethod}
    />,
  );

/** The "Video: <codec> @ <rate> fps" line, as the user reads it. */
const videoLine = async () => {
  const line = await screen.findByText(/player\.technical_info\.video/);
  return [line.props.children].flat(Number.POSITIVE_INFINITY).join("");
};

describe("TechnicalInfoOverlay frame rate", () => {
  test("shows the frame rate the player reports", async () => {
    await renderOverlay(
      { videoCodec: "hevc", fps: 25 },
      sourceWith({ ReferenceFrameRate: 23.976 }),
    );

    expect(await videoLine()).toContain("@ 25 fps");
  });

  // ExoPlayer leaves fps out when the container does not carry one; the line
  // used to drop the frame rate altogether.
  test("falls back to the server's reference frame rate when the player reports none", async () => {
    await renderOverlay(
      { videoCodec: "hevc" },
      sourceWith({ ReferenceFrameRate: 23.976, AverageFrameRate: 1000 }),
    );

    expect(await videoLine()).toContain("@ 23.976 fps");
  });

  test("falls back to the average frame rate on a server without a reference rate", async () => {
    await renderOverlay(
      { videoCodec: "hevc" },
      sourceWith({ AverageFrameRate: 50 }),
    );

    expect(await videoLine()).toContain("@ 50 fps");
  });

  // The media source describes the file on the server. A transcode may run
  // at another frame rate (a cap, deinterlacing), so the file's rate next to
  // the transcoded codec would be a guess presented as a measurement.
  test("does not show the source file's frame rate for a transcode", async () => {
    await renderOverlay(
      { videoCodec: "h264" },
      sourceWith({ ReferenceFrameRate: 50 }),
      "Transcode",
    );

    expect(await videoLine()).not.toContain("fps");
  });

  test("still shows the player's frame rate for a transcode", async () => {
    await renderOverlay(
      { videoCodec: "h264", fps: 25 },
      sourceWith({ ReferenceFrameRate: 50 }),
      "Transcode",
    );

    expect(await videoLine()).toContain("@ 25 fps");
  });

  test("leaves the frame rate out when nobody knows it", async () => {
    await renderOverlay({ videoCodec: "hevc" }, sourceWith());

    expect(await videoLine()).not.toContain("fps");
  });
});
