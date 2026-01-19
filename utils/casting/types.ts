/**
 * Unified Casting Types and Options
 * Abstracts Chromecast and AirPlay into a common interface
 */

export type CastProtocol = "chromecast" | "airplay";

export interface CastDevice {
  id: string;
  name: string;
  protocol: CastProtocol;
  type?: string;
}

export interface CastPlayerState {
  isConnected: boolean;
  isPlaying: boolean;
  currentItem: any | null;
  currentDevice: CastDevice | null;
  protocol: CastProtocol | null;
  progress: number;
  duration: number;
  volume: number;
  showControls: boolean;
  isBuffering: boolean;
}

export interface CastSegmentData {
  intro: { start: number; end: number } | null;
  credits: { start: number; end: number } | null;
  recap: { start: number; end: number } | null;
  commercial: Array<{ start: number; end: number }>;
  preview: Array<{ start: number; end: number }>;
}

export interface AudioTrack {
  index: number;
  language: string;
  codec: string;
  displayTitle: string;
}

export interface SubtitleTrack {
  index: number;
  language: string;
  codec: string;
  displayTitle: string;
  isForced: boolean;
}

export interface MediaSource {
  id: string;
  name: string;
  bitrate?: number;
  container: string;
}

export const CASTING_CONSTANTS = {
  POSTER_WIDTH: 300,
  POSTER_HEIGHT: 450,
  ANIMATION_DURATION: 300,
  CONTROL_HIDE_DELAY: 5000,
  PROGRESS_UPDATE_INTERVAL: 1000,
  SEEK_FORWARD_SECONDS: 10,
  SEEK_BACKWARD_SECONDS: 10,
} as const;

export const DEFAULT_CAST_STATE: CastPlayerState = {
  isConnected: false,
  isPlaying: false,
  currentItem: null,
  currentDevice: null,
  protocol: null,
  progress: 0,
  duration: 0,
  volume: 0.5,
  showControls: true,
  isBuffering: false,
};

export type ConnectionQuality = "excellent" | "good" | "fair" | "poor";

// Protocol-specific colors for UI differentiation
export const PROTOCOL_COLORS = {
  chromecast: "#e50914", // Red (Google Cast)
  airplay: "#007AFF", // Blue (Apple)
} as const;
