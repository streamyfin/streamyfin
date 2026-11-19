import {
  REMOTE_PLAYER_ACCENT,
  REMOTE_TINT_BOTTOM_TONE,
  REMOTE_TINT_MIN_CHROMA,
  REMOTE_TINT_NEUTRAL,
  REMOTE_TINT_TOP_TONE,
} from "@/constants/RemotePlayer";
import type { RemotePlayerTint } from "@/modules/mpv-player/src/RemotePlayerPresentation.types";

export type { RemotePlayerTint };

/** sRGB channels, 0 to 1. */
type Rgb = [number, number, number];

/** CIELAB lightness, chroma and hue (degrees, 0 to 360) of a color, D65 white. */
export interface Lch {
  l: number;
  c: number;
  h: number;
}

const WHITE: Rgb = [0.95047, 1, 1.08883];
const EPSILON = (6 / 29) ** 3;
const KAPPA = 3 * (6 / 29) ** 2;
const GAMUT_SEARCH_STEPS = 24;

const parse = (color: string): Rgb | null => {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!match) return null;
  const hex =
    match[1].length === 3
      ? [...match[1]].map((digit) => digit + digit).join("")
      : match[1];
  return [0, 2, 4].map(
    (at) => Number.parseInt(hex.slice(at, at + 2), 16) / 255,
  ) as Rgb;
};

const toLinear = (v: number) =>
  v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
const toGamma = (v: number) =>
  v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;

const labOf = (rgb: Rgb): Rgb => {
  const [r, g, b] = rgb.map(toLinear);
  const xyz: Rgb = [
    (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / WHITE[0],
    (0.2126729 * r + 0.7151522 * g + 0.072175 * b) / WHITE[1],
    (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / WHITE[2],
  ];
  const [fx, fy, fz] = xyz.map((t) =>
    t > EPSILON ? Math.cbrt(t) : t / KAPPA + 4 / 29,
  );
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
};

/** Linear sRGB of a CIELAB color; outside 0 to 1 when the color is out of gamut. */
const linearOf = (l: number, a: number, b: number): Rgb => {
  const fy = (l + 16) / 116;
  const [x, y, z] = [fy + a / 500, fy, fy - b / 200].map((t, at) => {
    const value = t > 6 / 29 ? t ** 3 : KAPPA * (t - 4 / 29);
    return value * WHITE[at];
  });
  return [
    3.2404542 * x - 1.5371385 * y - 0.4985314 * z,
    -0.969266 * x + 1.8760108 * y + 0.041556 * z,
    0.0556434 * x - 0.2040259 * y + 1.0572252 * z,
  ];
};

const inGamut = (rgb: Rgb) => rgb.every((v) => v >= 0 && v <= 1);

const hexOf = (rgb: Rgb): string =>
  `#${rgb
    .map((v) =>
      Math.round(Math.min(1, Math.max(0, toGamma(v))) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")
    .toUpperCase()}`;

/** The color at lightness [l] with [source]'s hue, its chroma brought down to what sRGB holds there. */
const atTone = (source: Lch, l: number): string => {
  const radians = (source.h * Math.PI) / 180;
  const at = (c: number) =>
    linearOf(l, c * Math.cos(radians), c * Math.sin(radians));
  if (inGamut(at(source.c))) return hexOf(at(source.c));
  let low = 0;
  let high = source.c;
  for (let step = 0; step < GAMUT_SEARCH_STEPS; step++) {
    const mid = (low + high) / 2;
    if (inGamut(at(mid))) low = mid;
    else high = mid;
  }
  return hexOf(at(low));
};

/** CIELAB lightness, chroma and hue of a `#RGB` or `#RRGGBB` color; null for anything else. */
export const lchOf = (color: string): Lch | null => {
  const rgb = parse(color);
  if (!rgb) return null;
  const [l, a, b] = labOf(rgb);
  const h = (Math.atan2(b, a) * 180) / Math.PI;
  return { l, c: Math.hypot(a, b), h: h < 0 ? h + 360 : h };
};

/**
 * The remote player's background from its artwork's color: the color's hue and
 * chroma, as much of the chroma as sRGB holds, at tone 20 on top and tone 10
 * below (CIELAB L*), so white text and the accent read whatever the artwork.
 * No color, or one too grey to tint with, gives the neutral.
 */
export const remoteTint = (
  color: string | null | undefined,
): RemotePlayerTint => {
  const source = color ? lchOf(color) : null;
  if (!source || source.c < REMOTE_TINT_MIN_CHROMA) {
    return { ...REMOTE_TINT_NEUTRAL, accent: REMOTE_PLAYER_ACCENT };
  }
  return {
    top: atTone(source, REMOTE_TINT_TOP_TONE),
    bottom: atTone(source, REMOTE_TINT_BOTTOM_TONE),
    accent: REMOTE_PLAYER_ACCENT,
  };
};

const luminance = (color: string): number => {
  const rgb = parse(color);
  if (!rgb) throw new Error(`Not a color: ${color}`);
  const [r, g, b] = rgb.map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** WCAG contrast ratio of two `#RRGGBB` colors, from 1 to 21, either way round. */
export const contrastRatio = (a: string, b: string): number => {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
};
