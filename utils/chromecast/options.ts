/**
 * Chromecast player configuration and constants
 */

export const CHROMECAST_CONSTANTS = {
  // Timing (all milliseconds for consistency)
  PROGRESS_REPORT_INTERVAL_MS: 10_000,
  CONTROLS_TIMEOUT_MS: 5_000,
  BUFFERING_THRESHOLD_MS: 10_000,
  NEXT_EPISODE_COUNTDOWN_MS: 30_000,
  CONNECTION_CHECK_INTERVAL_MS: 5_000,

  // UI
  POSTER_WIDTH: 300,
  POSTER_HEIGHT: 450,
  MINI_PLAYER_HEIGHT: 80,
  SKIP_FORWARD_SECS: 15, // overridden by settings
  SKIP_BACKWARD_SECS: 15, // overridden by settings

  // Animation
  ANIMATION_DURATION_MS: 300,
  BLUR_RADIUS: 10,
} as const;

export const CONNECTION_QUALITY = {
  EXCELLENT: { min: 50, label: "Excellent", icon: "wifi" }, // min Mbps
  GOOD: { min: 30, label: "Good", icon: "signal" }, // min Mbps
  FAIR: { min: 15, label: "Fair", icon: "cellular" }, // min Mbps
  POOR: { min: 0, label: "Poor", icon: "warning" }, // min Mbps
} as const;

export type ConnectionQuality = keyof typeof CONNECTION_QUALITY;

export type PlaybackState = "playing" | "paused" | "stopped" | "buffering";

export interface ChromecastPlayerState {
  isConnected: boolean;
  deviceName: string | null;
  playbackState: PlaybackState;
  progress: number; // milliseconds
  duration: number; // milliseconds
  volume: number; // 0-1
  isMuted: boolean;
  currentItemId: string | null;
  connectionQuality: ConnectionQuality;
}

export interface ChromecastSegmentData {
  intro: { start: number; end: number } | null;
  credits: { start: number; end: number } | null;
  recap: { start: number; end: number } | null;
  commercial: { start: number; end: number }[];
  preview: { start: number; end: number }[];
}

export const DEFAULT_CHROMECAST_STATE: ChromecastPlayerState = {
  isConnected: false,
  deviceName: null,
  playbackState: "stopped",
  progress: 0,
  duration: 0,
  volume: 1,
  isMuted: false,
  currentItemId: null,
  connectionQuality: "GOOD",
};
