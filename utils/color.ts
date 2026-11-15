const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * A hex color with the given alpha, as `#rrggbbaa`. Any other color is
 * returned as it is.
 */
export const withAlpha = (color: string, alpha: number): string => {
  const hex = HEX_COLOR.exec(color)?.[1];
  if (!hex) return color;
  const rgb =
    hex.length === 3
      ? hex
          .split("")
          .map((digit) => digit + digit)
          .join("")
      : hex;
  const byte = Math.round(Math.min(Math.max(alpha, 0), 1) * 255);
  return `#${rgb}${byte.toString(16).padStart(2, "0")}`;
};
