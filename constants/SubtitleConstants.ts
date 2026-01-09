/**
 * VLC subtitle styling constants
 * These values are used with VLC's FreeType subtitle rendering engine
 */

// VLC color values (decimal representation of hex colors)
export const VLC_COLORS: Record<string, number> = {
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

// VLC color names for UI display
export const VLC_COLOR_OPTIONS = Object.keys(VLC_COLORS);

// VLC outline thickness values in pixels
export const OUTLINE_THICKNESS: Record<string, number> = {
  None: 0,
  Thin: 2,
  Normal: 4,
  Thick: 6,
};

// Outline thickness options for UI
export const OUTLINE_THICKNESS_OPTIONS = Object.keys(
  OUTLINE_THICKNESS,
) as Array<"None" | "Thin" | "Normal" | "Thick">;
