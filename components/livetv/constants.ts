export const EPG_PX_PER_HOUR = 200;

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
