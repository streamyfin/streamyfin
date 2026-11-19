import {
  REMOTE_PLAYER_ACCENT,
  REMOTE_TINT_BOTTOM_TONE,
  REMOTE_TINT_NEUTRAL,
  REMOTE_TINT_TOP_TONE,
} from "@/constants/RemotePlayer";
import { contrastRatio, lchOf, remoteTint } from "./remoteTint";

// A tone is reached up to what rounding to 8-bit channels moves it; a hue, up to what it moves at the low chroma a
// tone of 10 leaves some hues.
const TONE_TOLERANCE = 1;
const HUE_TOLERANCE_DEG = 6;
const READABLE = 4.5;

const hueGap = (a: number, b: number): number => {
  const gap = Math.abs(a - b) % 360;
  return Math.min(gap, 360 - gap);
};

/** The fully saturated sRGB color of a hue, HSL(hue, 100 %, 50 %). */
const saturated = (hue: number): string => {
  const channel = (n: number) => {
    const k = (n + hue / 30) % 12;
    const value = 0.5 - 0.5 * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(value * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
};

const expectTonesAndHue = (color: string) => {
  const source = lchOf(color);
  const tint = remoteTint(color);
  const top = lchOf(tint.top);
  const bottom = lchOf(tint.bottom);
  expect(source).not.toBeNull();
  expect(Math.abs(top!.l - REMOTE_TINT_TOP_TONE)).toBeLessThanOrEqual(
    TONE_TOLERANCE,
  );
  expect(Math.abs(bottom!.l - REMOTE_TINT_BOTTOM_TONE)).toBeLessThanOrEqual(
    TONE_TOLERANCE,
  );
  expect(hueGap(top!.h, source!.h)).toBeLessThanOrEqual(HUE_TOLERANCE_DEG);
  expect(hueGap(bottom!.h, source!.h)).toBeLessThanOrEqual(HUE_TOLERANCE_DEG);
  return { tint, top: top!, bottom: bottom! };
};

describe("remoteTint", () => {
  test("a blue poster gives tone 20 on top and tone 10 below, same hue", () => {
    const { tint } = expectTonesAndHue("#5AA2C4");
    expect(tint.accent).toBe(REMOTE_PLAYER_ACCENT);
  });

  test("an orange poster keeps its hue", () => {
    expectTonesAndHue("#D9822B");
  });

  test("a pale yellow poster is brought down to the same tones", () => {
    const { top } = expectTonesAndHue("#F2E6A7");
    // Brought into the gamut at tone 20, not left grey.
    expect(top.c).toBeGreaterThan(0);
  });

  test("a black and white poster gets the neutral", () => {
    const neutral = { ...REMOTE_TINT_NEUTRAL, accent: REMOTE_PLAYER_ACCENT };
    expect(remoteTint("#808080")).toEqual(neutral);
    expect(remoteTint(null)).toEqual(neutral);
    expect(remoteTint(undefined)).toEqual(neutral);
    // The extraction library's own fallback, and what is not a color at all.
    expect(remoteTint("#fff")).toEqual(neutral);
    expect(remoteTint("not a color")).toEqual(neutral);
    // The neutral stands at the same two tones.
    expect(
      Math.abs(lchOf(REMOTE_TINT_NEUTRAL.top)!.l - REMOTE_TINT_TOP_TONE),
    ).toBeLessThanOrEqual(TONE_TOLERANCE);
    expect(
      Math.abs(lchOf(REMOTE_TINT_NEUTRAL.bottom)!.l - REMOTE_TINT_BOTTOM_TONE),
    ).toBeLessThanOrEqual(TONE_TOLERANCE);
  });

  test("white text reads on every hue", () => {
    for (let hue = 0; hue < 360; hue++) {
      const { top } = remoteTint(saturated(hue));
      expect(contrastRatio("#FFFFFF", top)).toBeGreaterThanOrEqual(READABLE);
    }
  });

  test("the accent reads on every hue", () => {
    for (let hue = 0; hue < 360; hue++) {
      const { top, accent } = remoteTint(saturated(hue));
      expect(contrastRatio(accent, top)).toBeGreaterThanOrEqual(READABLE);
    }
  });
});

describe("contrastRatio", () => {
  test("is WCAG's, either way round", () => {
    expect(contrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21, 5);
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#777777")).toBeCloseTo(1, 5);
  });
});
