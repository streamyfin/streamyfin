/**
 * Unified Casting Helper Functions
 * Common utilities for casting protocols
 */

/**
 * Format milliseconds to HH:MM:SS or MM:SS
 */
export const formatTime = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

/**
 * Calculate ending time based on current progress and duration.
 * Uses locale-aware formatting when available.
 */
export const calculateEndingTime = (
  currentMs: number,
  durationMs: number,
): string => {
  const remainingMs = durationMs - currentMs;
  const endTime = new Date(Date.now() + remainingMs);

  try {
    return endTime.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    // Fallback for environments without Intl support
    const hours = endTime.getHours();
    const minutes = endTime.getMinutes();
    const ampm = hours >= 12 ? "PM" : "AM";
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes.toString().padStart(2, "0")} ${ampm}`;
  }
};

/**
 * Get poster URL for item with specified dimensions
 */
export const getPosterUrl = (
  baseUrl: string | undefined,
  itemId: string | undefined,
  tag: string | undefined,
  width: number,
  height: number,
): string | null => {
  if (!baseUrl || !itemId) return null;

  const params = new URLSearchParams({
    maxWidth: width.toString(),
    maxHeight: height.toString(),
    quality: "90",
    ...(tag && { tag }),
  });

  return `${baseUrl}/Items/${itemId}/Images/Primary?${params.toString()}`;
};

/**
 * Truncate title to max length with ellipsis
 */
export const truncateTitle = (title: string, maxLength: number): string => {
  if (maxLength < 4) return title.substring(0, maxLength);
  if (title.length <= maxLength) return title;
  return `${title.substring(0, maxLength - 3)}...`;
};

/**
 * Check if current time is within a segment
 */
export const isWithinSegment = (
  currentMs: number,
  segment: { start: number; end: number } | null,
): boolean => {
  if (!segment) return false;
  const currentSeconds = currentMs / 1000;
  return currentSeconds >= segment.start && currentSeconds <= segment.end;
};

/**
 * Format trickplay time from {hours, minutes, seconds} to display string.
 * Produces "H:MM:SS" when hours > 0, otherwise "MM:SS".
 */
export const formatTrickplayTime = (time: {
  hours: number;
  minutes: number;
  seconds: number;
}): string => {
  const mm = String(time.minutes).padStart(2, "0");
  const ss = String(time.seconds).padStart(2, "0");
  return time.hours > 0 ? `${time.hours}:${mm}:${ss}` : `${mm}:${ss}`;
};
