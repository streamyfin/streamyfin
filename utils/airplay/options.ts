/**
 * AirPlay Options and Types
 * Configuration constants and type definitions for AirPlay player
 */

export interface AirPlayDevice {
  name: string;
  id: string;
  type: string;
}

export interface AirPlayPlayerState {
  isConnected: boolean;
  isPlaying: boolean;
  currentItem: any | null;
  currentDevice: AirPlayDevice | null;
  progress: number;
  duration: number;
  volume: number;
  showControls: boolean;
}

export interface AirPlaySegmentData {
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

export const AIRPLAY_CONSTANTS = {
  POSTER_WIDTH: 300,
  POSTER_HEIGHT: 450,
  ANIMATION_DURATION: 300,
  CONTROL_HIDE_DELAY: 5000,
  PROGRESS_UPDATE_INTERVAL: 1000,
  SEEK_FORWARD_SECONDS: 10,
  SEEK_BACKWARD_SECONDS: 10,
} as const;

export const DEFAULT_AIRPLAY_STATE: AirPlayPlayerState = {
  isConnected: false,
  isPlaying: false,
  currentItem: null,
  currentDevice: null,
  progress: 0,
  duration: 0,
  volume: 0.5,
  showControls: true,
};

export type ConnectionQuality = "excellent" | "good" | "fair" | "poor";
