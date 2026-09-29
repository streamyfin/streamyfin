/**
 * The share of a quota the bar shows as spent, between 0 and 1: what the
 * user has used, plus the seasons switched on, which are already taken off
 * `remaining`. No limit, nothing to show.
 */
export const quotaFill = (limit?: number, remaining?: number): number => {
  if (!limit) return 0;
  const used = (limit - (remaining ?? 0)) / limit;
  return Math.min(1, Math.max(0, used));
};

/**
 * Over what a quota counts, for its wording: every request ever made when it
 * has 0 days (Seerr then filters no date), a day at a time, or its days.
 */
export const quotaPeriod = (
  days?: number,
): "total" | "daily" | "days" | undefined => {
  if (days === undefined) return undefined;
  if (days === 0) return "total";
  return days === 1 ? "daily" : "days";
};
