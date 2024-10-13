/**
 * Converts ticks to a formatted string of hours and minutes.
 * Assumes that ticks are in milliseconds.
 *
 * @param ticks The number of milliseconds.
 * @returns A string formatted as "Xh Ym" where X is hours and Y is minutes.
 */
export const runtimeTicksToMinutes = (
  ticks: number | null | undefined
): string => {
  if (!ticks) return "0h 0m";

  const ticksPerMinute = 600000000;
  const ticksPerHour = 36000000000;

  const hours = Math.floor(ticks / ticksPerHour);
  const minutes = Math.floor((ticks % ticksPerHour) / ticksPerMinute);

  if (hours > 0) return `${hours}h ${minutes}m`;
  else return `${minutes}m`;
};

export const runtimeTicksToSeconds = (
  ticks: number | null | undefined
): string => {
  if (!ticks) return "0h 0m";

  const ticksPerMinute = 600000000;
  const ticksPerHour = 36000000000;

  const hours = Math.floor(ticks / ticksPerHour);
  const minutes = Math.floor((ticks % ticksPerHour) / ticksPerMinute);
  const seconds = Math.floor((ticks % ticksPerMinute) / 10000000);

  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  else return `${minutes}m ${seconds}s`;
};

export const formatTimeString = (
  t: number | null | undefined,
  tick = false
): string => {
  if (t === null || t === undefined) return "0:00";

  let seconds = t;
  if (tick) {
    seconds = Math.floor(t / 10000000); // Convert ticks to seconds
  }

  if (seconds < 0) return "0:00";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m ${remainingSeconds}s`;
  } else {
    return `${minutes}m ${remainingSeconds}s`;
  }
};

export const secondsToTicks = (seconds?: number | undefined) => {
  if (!seconds) return 0;
  return seconds * 10000000;
};

export const ticksToSeconds = (ticks?: number | undefined) => {
  if (!ticks) return 0;
  return ticks / 10000000;
};
