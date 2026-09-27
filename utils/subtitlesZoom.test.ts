import { describe, expect, test } from "bun:test";
import { stubReactNative } from "@/test-utils/reactNative";

stubReactNative({ OS: "android" });

const {
  getDisplayVideoDimensions,
  getEffectiveSubtitleScale,
  getSubtitleBaseScaleMultiplier,
} = await import("@/utils/subtitles");

describe("subtitle zoom compensation", () => {
  test("exports the Android native-player base calibration", () => {
    expect(getSubtitleBaseScaleMultiplier()).toBeCloseTo(1.035);
    expect(getEffectiveSubtitleScale(1)).toBeCloseTo(1.035);
  });

  test("normalizes rotated video dimensions", () => {
    expect(getDisplayVideoDimensions(1920, 1080, 90)).toEqual({
      width: 1080,
      height: 1920,
    });
    expect(getDisplayVideoDimensions(1920, 1080, 270)).toEqual({
      width: 1080,
      height: 1920,
    });
    expect(getDisplayVideoDimensions(1920, 1080, 180)).toEqual({
      width: 1920,
      height: 1080,
    });
  });

  test("keeps the calibrated portrait size without applying video zoom", () => {
    expect(getEffectiveSubtitleScale(1, 1920, 960, 1080, 2400)).toBe(1.84);
    expect(getEffectiveSubtitleScale(1, 1920, 960, 960, 480)).toBe(2.07);
  });

  test("ExoPlayer gets viewport-sized text without video-resolution compensation", () => {
    const expected = getSubtitleBaseScaleMultiplier("exoplayer");
    expect(
      getEffectiveSubtitleScale(1, 1920, 960, 1080, 2400, "exoplayer"),
    ).toBe(expected);
    expect(
      getEffectiveSubtitleScale(1, 1920, 960, 2400, 1080, "exoplayer"),
    ).toBe(expected);
  });
});
