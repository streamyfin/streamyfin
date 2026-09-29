import type { SendCommand } from "@jellyfin/sdk/lib/generated-client/models";

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
export { SYNC_PLAY_TUNING } from "@/constants/SyncPlay";

/** Jellyfin's tick unit. 1ms = 10000 ticks. */
export const TicksPerMillisecond = 10000;

/**
 * Player controls SyncPlay drives. The provider wires this up against
 * the active RN player (mpv / VLC / expo-video).
 */
export interface PlayerControls {
  itemId: string;
  play: () => void;
  pause: () => void;
  stop: () => void;
  /** Seek to absolute position in milliseconds. */
  seekTo: (positionMs: number) => void;
  setSpeed: (speed: number) => void;
  getSpeed: () => number;
  /** Current position in milliseconds. */
  getCurrentPosition: () => number;
  isPlaying: () => boolean;
  isBuffering: () => boolean;
}

/** SDK wire shape after required command fields pass runtime validation. */
export type PlaybackCommand = SendCommand &
  Required<Pick<SendCommand, "Command" | "When" | "EmittedAt">>;

/** OSD action types — drive optional player-overlay feedback. */
export type SyncPlayOsdAction =
  /** transient — 1.5s pulse, the unpause command fired locally */
  | "unpause"
  /** transient — 1.5s pulse, the pause command fired locally */
  | "pause"
  /** transient — 1.5s pulse, a seek command applied locally */
  | "seek"
  /** persistent — group is about to play (Waiting+Unpause / pending Unpause) */
  | "schedule-play"
  /** persistent — another client is buffering (Waiting+Buffer) */
  | "buffering"
  /** persistent — group transitioning to pause (Waiting+Pause) */
  | "wait-pause"
  /** persistent — group transitioning to unpause; sibling of schedule-play */
  | "wait-unpause";
