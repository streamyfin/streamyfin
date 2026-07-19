/**
 * Convert a "days back" setting value into the ISO timestamp Jellyfin's
 * Next Up endpoint expects for `nextUpDateCutoff`. The server then hides
 * Next Up entries for series whose last-watched episode is older than that.
 *
 * Returns undefined when the value is missing or not a positive number, so
 * the server default (no cutoff) applies instead of `new Date(NaN)` throwing.
 */
export const getNextUpDateCutoff = (
  daysCutoff?: string,
): string | undefined => {
  if (!daysCutoff) return undefined;
  const days = Number.parseInt(daysCutoff, 10);
  if (!Number.isFinite(days) || days <= 0) return undefined;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
};
