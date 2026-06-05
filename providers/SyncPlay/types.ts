/**
 * SyncPlay — public types and tuning constants.
 *
 * Re-exports the SDK types we use, defines the small RN-specific
 * extensions (PlayerControls, OSD actions), and centralises the magic
 * numbers that govern sync behaviour.
 */

import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";

// SDK type re-exports — kept narrow on purpose, only what callers
// actually reach for.
export type {
  GroupInfoDto,
  GroupQueueMode,
  GroupRepeatMode,
  GroupShuffleMode,
  GroupStateType,
  GroupUpdate,
  PlayQueueUpdate,
  PlayQueueUpdateReason,
  SendCommand,
  SendCommandType,
  SyncPlayQueueItem,
  SyncPlayUserAccessType,
} from "@jellyfin/sdk/lib/generated-client/models";

/** Jellyfin's tick unit. 1ms = 10000 ticks. */
export const TicksPerMillisecond = 10000;

/**
 * Player controls SyncPlay drives. The provider wires this up against
 * the active RN player (mpv / VLC / expo-video).
 */
export interface PlayerControls {
  play: () => void;
  pause: () => void;
  /** Seek to absolute position in milliseconds. */
  seekTo: (positionMs: number) => void;
  setSpeed: (speed: number) => void;
  getSpeed: () => number;
  /** Current position in milliseconds. */
  getCurrentPosition: () => number;
  isPlaying: () => boolean;
  isBuffering: () => boolean;
}

/** OSD action types — drive optional player-overlay feedback. */
export type SyncPlayOsdAction =
  | "unpause"
  | "pause"
  | "seek"
  | "buffering"
  | "wait-pause"
  | "wait-unpause";

/**
 * Tuning constants. These mirror jellyfin-web's defaults; tweak with
 * care — they affect perceived sync quality across all clients.
 */
export const SYNC_PLAY_TUNING = {
  /** Drift threshold (ms) above which we hard-seek to catch up. */
  minDelaySkipToSync: 400,
  /** Drift beyond this (ms) is always corrected by seeking. */
  maxDelaySync: 3000,
  /** Don't escalate buffering to the group for blips shorter than this (ms). */
  minBufferingThresholdMs: 3000,
  /** Player-attach drift (ms) above which we reconcile to group position. */
  positionReconcileThresholdMs: 500,
  /** Safety timeout (ms) for in-flight Pause/Unpause optimistic UI. */
  pendingPlaybackTimeoutMs: 1500,
} as const;

/** Options accepted by `Controller.play`. */
export interface PlayOptions {
  ids?: string[];
  items?: BaseItemDto[];
  startIndex?: number;
  startPositionTicks?: number;
}
