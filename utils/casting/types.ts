/**
 * Unified Casting Types and Options
 * Protocol-agnostic casting interface - currently supports Chromecast
 * Architecture allows for future protocols (AirPlay, DLNA, etc.)
 */

import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";

export type CastProtocol = "chromecast";

export interface CastDevice {
  id: string;
  name: string;
  protocol: CastProtocol;
  type?: string;
}

export interface CastPlayerState {
  isConnected: boolean;
  isPlaying: boolean;
  currentItem: BaseItemDto | null;
  currentDevice: CastDevice | null;
  protocol: CastProtocol | null;
  progress: number;
  duration: number;
  volume: number;
  isBuffering: boolean;
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
  isBuffering: false,
};
