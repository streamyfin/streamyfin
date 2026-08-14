import { describe, expect, mock, test } from "bun:test";

mock.module("react-native", () => ({
  Platform: { OS: "android", isTV: false },
}));

const { getZoomSubtitleScaleRatio } = await import("@/utils/subtitles");

describe("subtitle zoom compensation", () => {
  test("undoes only the extra contain-to-cover zoom", () => {
    expect(getZoomSubtitleScaleRatio(1920, 960, 1080, 2400)).toBeCloseTo(0.225);
    expect(getZoomSubtitleScaleRatio(1920, 960, 2400, 1080)).toBeCloseTo(0.9);
  });
});
