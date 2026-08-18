import { describe, expect, mock, test } from "bun:test";

mock.module("react-native", () => ({
  Platform: { OS: "android", isTV: false },
}));

const {
  getDisplayVideoDimensions,
  getEffectiveSubtitleScale,
  getSubtitleBaseScaleMultiplier,
  getZoomSubtitleScaleRatio,
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

  test("undoes only the extra contain-to-cover zoom", () => {
    expect(getZoomSubtitleScaleRatio(1920, 960, 1080, 2400)).toBeCloseTo(0.225);
    expect(getZoomSubtitleScaleRatio(1920, 960, 2400, 1080)).toBeCloseTo(0.9);
  });
});
