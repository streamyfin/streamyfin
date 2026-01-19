/**
 * Chromecast utility helper functions
 */

import { CONNECTION_QUALITY, type ConnectionQuality } from "./options";

/**
 * Formats milliseconds to HH:MM:SS or MM:SS
 */
export const formatTime = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (num: number) => num.toString().padStart(2, "0");

  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${minutes}:${pad(seconds)}`;
};

/**
 * Calculates ending time based on current time and remaining duration
 */
export const calculateEndingTime = (
  remainingMs: number,
  use24Hour = true,
): string => {
  const endTime = new Date(Date.now() + remainingMs);
  const hours = endTime.getHours();
  const minutes = endTime.getMinutes();

  if (use24Hour) {
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
  }

  const period = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes.toString().padStart(2, "0")} ${period}`;
};

/**
 * Determines connection quality based on bitrate and latency
 */
export const getConnectionQuality = (
  bitrateMbps: number,
  latencyMs?: number,
): ConnectionQuality => {
  // Prioritize bitrate, but factor in latency if available
  let effectiveBitrate = bitrateMbps;

  if (latencyMs !== undefined && latencyMs > 200) {
    effectiveBitrate *= 0.7; // Reduce effective quality for high latency
  }

  if (effectiveBitrate >= CONNECTION_QUALITY.EXCELLENT.min) {
    return "EXCELLENT";
  }
  if (effectiveBitrate >= CONNECTION_QUALITY.GOOD.min) {
    return "GOOD";
  }
  if (effectiveBitrate >= CONNECTION_QUALITY.FAIR.min) {
    return "FAIR";
  }
  return "POOR";
};

/**
 * Checks if we should show next episode countdown
 */
export const shouldShowNextEpisodeCountdown = (
  remainingMs: number,
  hasNextEpisode: boolean,
  countdownStartSeconds: number,
): boolean => {
  return hasNextEpisode && remainingMs <= countdownStartSeconds * 1000;
};

/**
 * Truncates long titles with ellipsis
 */
export const truncateTitle = (title: string, maxLength: number): string => {
  if (title.length <= maxLength) return title;
  return `${title.substring(0, maxLength - 3)}...`;
};

/**
 * Formats episode info (e.g., "S1 E1" or "Episode 1")
 */
export const formatEpisodeInfo = (
  seasonNumber?: number | null,
  episodeNumber?: number | null,
): string => {
  if (
    seasonNumber !== undefined &&
    seasonNumber !== null &&
    episodeNumber !== undefined &&
    episodeNumber !== null
  ) {
    return `S${seasonNumber} E${episodeNumber}`;
  }
  if (episodeNumber !== undefined && episodeNumber !== null) {
    return `Episode ${episodeNumber}`;
  }
  return "";
};

/**
 * Gets the appropriate poster URL (season for series, primary for movies)
 */
export const getPosterUrl = (
  item: {
    Type?: string;
    ParentBackdropImageTags?: string[];
    SeriesId?: string;
    Id?: string;
  },
  api: { basePath?: string },
): string | null => {
  if (!api.basePath) return null;

  if (item.Type === "Episode" && item.SeriesId) {
    // Use season poster for episodes
    return `${api.basePath}/Items/${item.SeriesId}/Images/Primary`;
  }

  // Use primary image for movies and other types
  if (item.Id) {
    return `${api.basePath}/Items/${item.Id}/Images/Primary`;
  }

  return null;
};

/**
 * Checks if currently within a segment (intro, credits, etc.)
 */
export const isWithinSegment = (
  currentMs: number,
  segment: { start: number; end: number } | null,
): boolean => {
  if (!segment) return false;
  const currentSeconds = currentMs / 1000;
  return currentSeconds >= segment.start && currentSeconds <= segment.end;
};
