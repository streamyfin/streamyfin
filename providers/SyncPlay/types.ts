/**
 * SyncPlay Types
 *
 * Re-exports Jellyfin SDK types and defines app-specific types.
 * Following the pattern used in offline downloads.
 */

import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";

// ============================================================================
// Re-export SDK Types
// ============================================================================

// Group types
// Playback command types
// Queue types
// User access type
// Group update message types
export type {
  GroupInfoDto,
  GroupRepeatMode,
  GroupShuffleMode,
  GroupStateType,
  GroupUpdate,
  GroupUpdateType,
  PlayQueueUpdate,
  PlayQueueUpdateReason,
  SendCommand,
  SendCommandType,
  SyncPlayGroupJoinedUpdate,
  SyncPlayGroupLeftUpdate,
  SyncPlayPlayQueueUpdate,
  SyncPlayQueueItem,
  SyncPlayStateUpdate,
  SyncPlayUserAccessType,
  SyncPlayUserJoinedUpdate,
  SyncPlayUserLeftUpdate,
} from "@jellyfin/sdk/lib/generated-client/models";

// ============================================================================
// Constants
// ============================================================================

export const TicksPerMillisecond = 10000;
export const WaitForEventDefaultTimeout = 30000; // milliseconds
export const WaitForPlayerEventTimeout = 500; // milliseconds

// ============================================================================
// App-Specific Types (not in SDK)
// ============================================================================

/**
 * Time sync measurement for NTP-like synchronization
 */
export interface TimeSyncMeasurement {
  requestSent: number;
  requestReceived: number;
  responseSent: number;
  responseReceived: number;
}

/**
 * Player controls interface for integrating with MPV player
 */
export interface PlayerControls {
  play: () => void;
  pause: () => void;
  seekTo: (positionMs: number) => void;
  setSpeed: (speed: number) => void;
  getSpeed: () => number;
  getCurrentPosition: () => number;
  isPlaying: () => boolean;
  isBuffering: () => boolean;
}

/**
 * OSD action types for visual feedback
 */
export type SyncPlayOsdAction =
  | "schedule-play"
  | "unpause"
  | "pause"
  | "seek"
  | "buffering"
  | "wait-pause"
  | "wait-unpause";

/**
 * SyncPlay settings for sync correction algorithms
 */
export interface SyncPlaySettings {
  // SpeedToSync settings
  minDelaySpeedToSync: number;
  maxDelaySpeedToSync: number;
  speedToSyncDuration: number;

  // SkipToSync settings
  minDelaySkipToSync: number;

  // Feature toggles
  useSpeedToSync: boolean;
  useSkipToSync: boolean;
  enableSyncCorrection: boolean;

  // Time sync
  extraTimeOffset: number;
}

export const DEFAULT_SYNC_PLAY_SETTINGS: SyncPlaySettings = {
  minDelaySpeedToSync: 60.0,
  maxDelaySpeedToSync: 3000.0,
  speedToSyncDuration: 1000.0,
  minDelaySkipToSync: 400.0,
  useSpeedToSync: true,
  useSkipToSync: true,
  enableSyncCorrection: false,
  extraTimeOffset: 0.0,
};

/**
 * Stats for debugging/display
 */
export interface SyncPlayStats {
  timeSyncDevice: string;
  timeSyncOffset: string;
  playbackDiff: string;
  syncMethod: string;
}

/**
 * Play options for starting playback
 */
export interface PlayOptions {
  ids?: string[];
  items?: BaseItemDto[];
  startIndex?: number;
  startPositionTicks?: number;
  serverId?: string;
}
