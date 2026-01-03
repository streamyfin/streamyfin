declare module "*.svg" {
  const content: any;
  export default content;
}

declare module "*.png" {
  const value: any;
  export default value;
}

// Type declarations for react-native-track-player (GitHub fork without compiled types)
declare module "react-native-track-player" {
  export interface Track {
    id: string;
    url: string;
    title?: string;
    artist?: string;
    album?: string;
    artwork?: string;
    duration?: number;
    [key: string]: any;
  }

  export interface Progress {
    position: number;
    duration: number;
    buffered: number;
  }

  export interface PlaybackState {
    state: State;
  }

  export interface PlaybackActiveTrackChangedEvent {
    lastIndex?: number;
    lastTrack?: Track;
    lastPosition: number;
    index?: number;
    track?: Track;
  }

  export enum State {
    None = "none",
    Ready = "ready",
    Playing = "playing",
    Paused = "paused",
    Stopped = "stopped",
    Buffering = "buffering",
    Loading = "loading",
    Error = "error",
  }

  export enum Event {
    PlaybackState = "playback-state",
    PlaybackError = "playback-error",
    PlaybackQueueEnded = "playback-queue-ended",
    PlaybackTrackChanged = "playback-track-changed",
    PlaybackActiveTrackChanged = "playback-active-track-changed",
    PlaybackProgressUpdated = "playback-progress-updated",
    PlaybackMetadataReceived = "playback-metadata-received",
    RemotePlay = "remote-play",
    RemotePause = "remote-pause",
    RemoteStop = "remote-stop",
    RemoteSkip = "remote-skip",
    RemoteNext = "remote-next",
    RemotePrevious = "remote-previous",
    RemoteSeek = "remote-seek",
    RemoteJumpForward = "remote-jump-forward",
    RemoteJumpBackward = "remote-jump-backward",
    RemoteDuck = "remote-duck",
  }

  export enum Capability {
    Play = "play",
    Pause = "pause",
    Stop = "stop",
    SeekTo = "seek-to",
    Skip = "skip",
    SkipToNext = "skip-to-next",
    SkipToPrevious = "skip-to-previous",
    JumpForward = "jump-forward",
    JumpBackward = "jump-backward",
    SetRating = "set-rating",
    Like = "like",
    Dislike = "dislike",
    Bookmark = "bookmark",
  }

  export enum RepeatMode {
    Off = 0,
    Track = 1,
    Queue = 2,
  }

  export interface UpdateOptions {
    capabilities?: Capability[];
    compactCapabilities?: Capability[];
    notificationCapabilities?: Capability[];
    [key: string]: any;
  }

  export function setupPlayer(options?: any): Promise<void>;
  export function updateOptions(options: UpdateOptions): Promise<void>;
  export function add(
    tracks: Track | Track[],
    insertBeforeIndex?: number,
  ): Promise<void>;
  export function remove(indexOrIndexes: number | number[]): Promise<void>;
  export function skip(index: number): Promise<void>;
  export function skipToNext(): Promise<void>;
  export function skipToPrevious(): Promise<void>;
  export function play(): Promise<void>;
  export function pause(): Promise<void>;
  export function stop(): Promise<void>;
  export function reset(): Promise<void>;
  export function seekTo(position: number): Promise<void>;
  export function getProgress(): Promise<Progress>;
  export function getQueue(): Promise<Track[]>;
  export function getActiveTrack(): Promise<Track | undefined>;
  export function getActiveTrackIndex(): Promise<number | undefined>;
  export function setRepeatMode(mode: RepeatMode): Promise<void>;
  export function getRepeatMode(): Promise<RepeatMode>;
  export function move(fromIndex: number, toIndex: number): Promise<void>;
  export function addEventListener<T = any>(
    event: Event,
    listener: (event: T) => void,
  ): { remove: () => void };

  export function useProgress(interval?: number): Progress;
  export function usePlaybackState(): PlaybackState;
  export function useActiveTrack(): Track | undefined;

  const TrackPlayer: {
    setupPlayer: typeof setupPlayer;
    updateOptions: typeof updateOptions;
    add: typeof add;
    remove: typeof remove;
    skip: typeof skip;
    skipToNext: typeof skipToNext;
    skipToPrevious: typeof skipToPrevious;
    play: typeof play;
    pause: typeof pause;
    stop: typeof stop;
    reset: typeof reset;
    seekTo: typeof seekTo;
    getProgress: typeof getProgress;
    getQueue: typeof getQueue;
    getActiveTrack: typeof getActiveTrack;
    getActiveTrackIndex: typeof getActiveTrackIndex;
    setRepeatMode: typeof setRepeatMode;
    getRepeatMode: typeof getRepeatMode;
    move: typeof move;
    addEventListener: typeof addEventListener;
  };

  export default TrackPlayer;
}
