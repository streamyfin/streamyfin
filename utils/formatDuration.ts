/**
 * Formats duration in minutes to a human-readable string
 * Examples:
 * - 15 minutes -> "15 minutes"
 * - 60 minutes -> "1 hour"
 * - 90 minutes -> "1 hour 30 minutes"
 * - 120 minutes -> "2 hours"
 */
export const formatDuration = (
  minutes: number,
  t: (key: string, options?: { count?: number }) => string,
): string => {
  if (minutes < 60) {
    // Less than an hour - show minutes
    return `${minutes} ${t("jellysleep.minute", { count: minutes })}`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (remainingMinutes === 0) {
    // Exact hours - show only hours
    return `${hours} ${t("jellysleep.hour", { count: hours })}`;
  }

  // Hours and minutes - show both
  const hoursText = `${hours} ${t("jellysleep.hour", { count: hours })}`;
  const minutesText = `${remainingMinutes} ${t("jellysleep.minute", { count: remainingMinutes })}`;

  return `${hoursText} ${minutesText}`;
};
