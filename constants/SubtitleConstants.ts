export type VLCColor =
  | "Black"
  | "Gray"
  | "Silver"
  | "White"
  | "Maroon"
  | "Red"
  | "Fuchsia"
  | "Yellow"
  | "Olive"
  | "Green"
  | "Teal"
  | "Lime"
  | "Purple"
  | "Navy"
  | "Blue"
  | "Aqua";

export type OutlineThickness = "None" | "Thin" | "Normal" | "Thick";

export const VLC_COLORS: Record<VLCColor, number> = {
  Black: 0,
  Gray: 8421504,
  Silver: 12632256,
  White: 16777215,
  Maroon: 8388608,
  Red: 16711680,
  Fuchsia: 16711935,
  Yellow: 16776960,
  Olive: 8421376,
  Green: 32768,
  Teal: 32896,
  Lime: 65280,
  Purple: 8388736,
  Navy: 128,
  Blue: 255,
  Aqua: 65535,
};

export const OUTLINE_THICKNESS: Record<OutlineThickness, number> = {
  None: 0,
  Thin: 2,
  Normal: 4,
  Thick: 6,
};
