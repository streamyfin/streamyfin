/**
 * Chromecast player configuration and constants
 */

export const CHROMECAST_CONSTANTS = {
  // Timing
  PROGRESS_REPORT_INTERVAL: 10, // seconds
  CONTROLS_TIMEOUT: 5000, // ms
  BUFFERING_THRESHOLD: 10, // seconds of buffer before hiding indicator
  NEXT_EPISODE_COUNTDOWN_START: 30, // seconds before end
  CONNECTION_CHECK_INTERVAL: 5000, // ms

  // UI
  POSTER_WIDTH: 300,
  POSTER_HEIGHT: 450,
  MINI_PLAYER_HEIGHT: 80,
  SKIP_FORWARD_TIME: 15, // seconds (overridden by settings)
  SKIP_BACKWARD_TIME: 15, // seconds (overridden by settings)

  // Animation
  ANIMATION_DURATION: 300, // ms
  BLUR_RADIUS: 10,
} as const;

export const CONNECTION_QUALITY = {
  EXCELLENT: { min: 50, label: "Excellent", icon: "wifi" }, // min Mbps
  GOOD: { min: 30, label: "Good", icon: "signal" }, // min Mbps
  FAIR: { min: 15, label: "Fair", icon: "cellular" }, // min Mbps
  POOR: { min: 0, label: "Poor", icon: "warning" }, // min Mbps
} as const;

export type ConnectionQuality = keyof typeof CONNECTION_QUALITY;

export interface ChromecastPlayerState {
  isConnected: boolean;
  deviceName: string | null;
  isPlaying: boolean;
  isPaused: boolean;
  isStopped: boolean;
  isBuffering: boolean;
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
  isPlaying: false,
  isPaused: false,
  isStopped: true,
  isBuffering: false,
  progress: 0,
  duration: 0,
  volume: 1,
  isMuted: false,
  currentItemId: null,
  connectionQuality: "GOOD",
};
