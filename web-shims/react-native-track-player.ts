// Web shim: react-native-track-player is a native audio service with no
// browser implementation. Music playback is unavailable on desktop, so this
// exposes the API surface Streamyfin touches as inert no-ops — every consumer
// is already behind a `Platform.isTV` style guard for the same reason on tvOS,
// and MiniPlayerBar/MusicPlaybackEngine simply never get anything to play.

export enum State {
  None = "none",
  Ready = "ready",
  Playing = "playing",
  Paused = "paused",
  Stopped = "stopped",
  Buffering = "buffering",
  Loading = "loading",
  Ended = "ended",
  Error = "error",
}

export enum Event {
  PlaybackState = "playback-state",
  PlaybackError = "playback-error",
  PlaybackQueueEnded = "playback-queue-ended",
  PlaybackActiveTrackChanged = "playback-active-track-changed",
  PlaybackProgressUpdated = "playback-progress-updated",
  RemotePlay = "remote-play",
  RemotePause = "remote-pause",
  RemoteStop = "remote-stop",
  RemoteNext = "remote-next",
  RemotePrevious = "remote-previous",
  RemoteSeek = "remote-seek",
  RemoteJumpForward = "remote-jump-forward",
  RemoteJumpBackward = "remote-jump-backward",
  RemoteDuck = "remote-duck",
}

export enum RepeatMode {
  Off = 0,
  Track = 1,
  Queue = 2,
}

export enum Capability {
  Play = 0,
  Pause = 1,
  Stop = 2,
  SeekTo = 3,
  SkipToNext = 4,
  SkipToPrevious = 5,
}

export enum AppKilledPlaybackBehavior {
  ContinuePlayback = "continue-playback",
  StopPlaybackAndRemoveNotification = "stop-and-remove",
}

export type PlaybackActiveTrackChangedEvent = {
  lastTrack?: unknown;
  lastPosition?: number;
  index?: number;
  track?: unknown;
};

export type Track = Record<string, unknown>;
export type Progress = { position: number; duration: number; buffered: number };

const NO_PROGRESS: Progress = { position: 0, duration: 0, buffered: 0 };

export const useProgress = (_interval?: number): Progress => NO_PROGRESS;
export const usePlaybackState = (): { state: State } => ({ state: State.None });
export const useActiveTrack = (): Track | undefined => undefined;
export const useIsPlaying = (): {
  playing: boolean;
  bufferingDuringPlay: boolean;
} => ({
  playing: false,
  bufferingDuringPlay: false,
});
export const useTrackPlayerEvents = (
  _events: Event[],
  _handler: (...args: unknown[]) => void,
): void => undefined;

const noop = async (): Promise<void> => undefined;

const TrackPlayer = {
  setupPlayer: noop,
  updateOptions: noop,
  registerPlaybackService: (_factory: () => unknown) => undefined,
  addEventListener: (_event: Event, _listener: (...a: unknown[]) => void) => ({
    remove: () => undefined,
  }),
  add: noop,
  remove: noop,
  removeUpcomingTracks: noop,
  skip: noop,
  skipToNext: noop,
  skipToPrevious: noop,
  play: noop,
  pause: noop,
  stop: noop,
  reset: noop,
  seekTo: noop,
  setRepeatMode: noop,
  setVolume: noop,
  setRate: noop,
  getQueue: async (): Promise<Track[]> => [],
  getActiveTrack: async (): Promise<Track | undefined> => undefined,
  getActiveTrackIndex: async (): Promise<number | undefined> => undefined,
  getProgress: async (): Promise<Progress> => NO_PROGRESS,
  getPlaybackState: async (): Promise<{ state: State }> => ({
    state: State.None,
  }),
};

export default TrackPlayer;
