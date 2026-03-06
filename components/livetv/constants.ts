export const EPG_PX_PER_HOUR = 200;

// Shared visual constants for the LiveTV UI
export const EPG_FAVORITE_ICON_SIZE = 18;
export const EPG_PROGRESS_BAR_HEIGHT = 2;

// Guide rows and hour header
export const EPG_BORDER_WIDTH = 1.5;
export const EPG_BORDER_COLOR = "rgba(255, 255, 255, 0.15)";
export const EPG_SUBTLE_COLOR = "rgba(255, 255, 255, 0.08)";
export const EPG_CARD_BG_LIVE = "rgba(255, 255, 255, 0.12)";
export const EPG_CARD_BG_INACTIVE = "rgba(255, 255, 255, 0.05)";
export const EPG_TEXT_COLOR_PRIMARY = "rgba(255,255,255,0.75)";
export const EPG_TEXT_COLOR_SECONDARY = "rgba(255,255,255,0.35)";
export const EPG_NOW_INDICATOR_LINE = "rgba(255, 255, 255, 0.3)";
export const EPG_NOW_INDICATOR_DOT = "rgba(255, 255, 255, 0.75)";
export const EPG_ICON_COLOR_INACTIVE = "#737373";
export const EPG_HEADER_BG = "black";

/**
 * Returns the guide start time: now minus 15 minutes, floored to the nearest
 * half-hour boundary (:00 or :30), so the current position is always visible
 * with some past context.
 */
export function getGuideReferenceTime(): Date {
  const t = new Date(Date.now() - 15 * 60 * 1000);
  t.setMinutes(t.getMinutes() >= 30 ? 30 : 0, 0, 0);
  return t;
}
