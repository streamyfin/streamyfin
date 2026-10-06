export interface SyncPlayGroup {
  GroupId: string;
  GroupName: string;
  Participants: string[];
  State?: string;
  LastUpdatedAt?: string;
}

export interface SyncPlayPlayerState {
  itemId: string | null;
  positionTicks: number;
  isPlaying: boolean;
  isReady: boolean;
  isBuffering: boolean;
}

/** These methods operate locally. User controls send requests separately. */
export interface SyncPlayPlayerAdapter {
  /** Reload even the same media on queue restarts: EOF can unload a decoder. */
  reloadOnQueueRestart?: boolean;
  getState(): SyncPlayPlayerState;
  pause(): void | Promise<void>;
  resume(): void | Promise<void>;
  seek(positionTicks: number): void | Promise<void>;
  stop(): void | Promise<void>;
  /** Native decoders own this corrected client deadline, including late play. */
  scheduleCommand?(
    command: SyncPlayCommand,
    executeAtMs: number,
  ): Promise<void>;
  cancelScheduledCommands?(): void;
}

export interface SyncPlayLaunchRequest {
  itemId: string;
  playlistItemId: string;
  startPositionTicks: number;
  /** Check after any asynchronous preparation before presenting the route. */
  isCurrent?: () => boolean;
}

export type SyncPlayQueueMode = "Queue" | "QueueNext";
export type SyncPlayRepeatMode = "RepeatNone" | "RepeatOne" | "RepeatAll";
export type SyncPlayShuffleMode = "Sorted" | "Shuffle";

export interface SyncPlayQueueItem {
  ItemId: string;
  PlaylistItemId: string;
}

export type SyncPlayLauncher = (
  request: SyncPlayLaunchRequest,
) => Promise<void>;

export interface SyncPlayQueue {
  LastUpdate: string;
  Playlist: SyncPlayQueueItem[];
  PlayingItemIndex: number;
  StartPositionTicks?: number;
  IsPlaying?: boolean;
  Reason?: string;
  RepeatMode?: SyncPlayRepeatMode;
  ShuffleMode?: SyncPlayShuffleMode;
}

export interface SyncPlayCommand {
  GroupId: string;
  PlaylistItemId?: string;
  When: string;
  EmittedAt: string;
  PositionTicks?: number | null;
  Command: "Pause" | "Unpause" | "Seek" | "Stop";
}

export interface SyncPlayReadyRequest {
  When: string;
  PositionTicks: number;
  IsPlaying: boolean;
  PlaylistItemId: string;
}

export interface SyncPlaySnapshot {
  group: SyncPlayGroup | null;
  groups: SyncPlayGroup[];
  connected: boolean;
  busy: boolean;
  error: string | null;
  groupState: string | null;
  playlist: SyncPlayQueueItem[];
  playingItemIndex: number;
  currentPlaylistItemId: string | null;
  repeatMode: SyncPlayRepeatMode;
  shuffleMode: SyncPlayShuffleMode;
  /** This session's setting; Jellyfin does not broadcast ignore-wait updates. */
  ignoreWait: boolean;
  /**
   * False once the user has closed the player without leaving: still a
   * member, but the group's playback no longer opens a player here.
   */
  watching: boolean;
  hasNext: boolean;
  hasPrevious: boolean;
  /** Server minus client clock, milliseconds. */
  clockOffsetMs: number;
  pingMs: number;
}

export interface SyncPlayTransport {
  listGroups(): Promise<SyncPlayGroup[]>;
  getGroup(groupId: string): Promise<SyncPlayGroup | undefined>;
  createGroup(name: string): Promise<SyncPlayGroup | undefined>;
  joinGroup(groupId: string): Promise<void>;
  leaveGroup(): Promise<void>;
  getTime(): Promise<{
    RequestReceptionTime?: string;
    ResponseTransmissionTime?: string;
  }>;
  ping(pingMs: number): Promise<void>;
  playItems(ids: string[], index: number, ticks: number): Promise<void>;
  queueItems(ids: string[], mode: SyncPlayQueueMode): Promise<void>;
  removePlaylistItems(
    ids: string[],
    clearPlaylist: boolean,
    clearPlayingItem: boolean,
  ): Promise<void>;
  movePlaylistItem(playlistItemId: string, newIndex: number): Promise<void>;
  setPlaylistItem(playlistItemId: string): Promise<void>;
  setRepeatMode(mode: SyncPlayRepeatMode): Promise<void>;
  setShuffleMode(mode: SyncPlayShuffleMode): Promise<void>;
  setIgnoreWait(ignoreWait: boolean): Promise<void>;
  pause(): Promise<void>;
  unpause(): Promise<void>;
  seek(ticks: number): Promise<void>;
  stop(): Promise<void>;
  next(playlistItemId: string): Promise<void>;
  previous(playlistItemId: string): Promise<void>;
  ready(request: SyncPlayReadyRequest): Promise<void>;
  buffering(request: SyncPlayReadyRequest): Promise<void>;
}
