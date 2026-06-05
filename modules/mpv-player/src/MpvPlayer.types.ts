import type { StyleProp, ViewStyle } from "react-native";

export type OnLoadEventPayload = {
  url: string;
};

export type OnPlaybackStateChangePayload = {
  isPaused?: boolean;
  isPlaying?: boolean;
  isLoading?: boolean;
  isReadyToSeek?: boolean;
};

export type OnProgressEventPayload = {
  position: number;
  duration: number;
  progress: number;
  /** Seconds of video buffered ahead of current position */
  cacheSeconds: number;
};

export type OnErrorEventPayload = {
  error: string;
};

export type OnTracksReadyEventPayload = Record<string, never>;

export type OnPictureInPictureChangePayload = {
  isActive: boolean;
};

/**
 * Emitted when the user taps a PiP playback control while the view
 * was rendered with `syncPlayDelegated`. The host app should route
 * the action through the SyncPlay controller instead of acting
 * locally.
 */
export type OnPipPlayRequestPayload = Record<string, never>;
export type OnPipPauseRequestPayload = Record<string, never>;
export type OnPipSkipRequestPayload = {
  /** Absolute target position the user wants to seek to, in seconds. */
  targetSeconds: number;
  /** Skip interval requested by the OS (signed seconds). Debug only. */
  intervalSeconds: number;
};

export type NowPlayingMetadata = {
  title?: string;
  artist?: string;
  albumTitle?: string;
  artworkUri?: string;
};

export type MpvPlayerModuleEvents = {
  onChange: (params: ChangeEventPayload) => void;
};

export type ChangeEventPayload = {
  value: string;
};

export type VideoSource = {
  url: string;
  headers?: Record<string, string>;
  externalSubtitles?: string[];
  startPosition?: number;
  autoplay?: boolean;
  /** MPV subtitle track ID to select on start (1-based, -1 to disable) */
  initialSubtitleId?: number;
  /** MPV audio track ID to select on start (1-based) */
  initialAudioId?: number;
  /** MPV cache/buffer configuration */
  cacheConfig?: {
    /** Whether caching is enabled: "auto" (default), "yes", or "no" */
    enabled?: "auto" | "yes" | "no";
    /** Seconds of video to buffer (default: 10, range: 5-120) */
    cacheSeconds?: number;
    /** Maximum cache size in MB (default: 150, range: 50-500) */
    maxBytes?: number;
    /** Maximum backward cache size in MB (default: 50, range: 25-200) */
    maxBackBytes?: number;
  };
  /** MPV video output driver (Android only) */
  voDriver?: "gpu-next" | "gpu";
};

export type MpvPlayerViewProps = {
  source?: VideoSource;
  style?: StyleProp<ViewStyle>;
  /** Metadata for iOS Control Center and Lock Screen now playing info */
  nowPlayingMetadata?: NowPlayingMetadata;
  onLoad?: (event: { nativeEvent: OnLoadEventPayload }) => void;
  onPlaybackStateChange?: (event: {
    nativeEvent: OnPlaybackStateChangePayload;
  }) => void;
  onProgress?: (event: { nativeEvent: OnProgressEventPayload }) => void;
  onError?: (event: { nativeEvent: OnErrorEventPayload }) => void;
  onTracksReady?: (event: { nativeEvent: OnTracksReadyEventPayload }) => void;
  onPictureInPictureChange?: (event: {
    nativeEvent: OnPictureInPictureChangePayload;
  }) => void;
  /**
   * When true, PiP play/pause/skip controls emit the corresponding
   * `onPipPlayRequest` / `onPipPauseRequest` / `onPipSkipRequest`
   * events instead of driving MPV directly. Used to route PiP control
   * actions through SyncPlay.
   */
  syncPlayDelegated?: boolean;
  onPipPlayRequest?: (event: { nativeEvent: OnPipPlayRequestPayload }) => void;
  onPipPauseRequest?: (event: {
    nativeEvent: OnPipPauseRequestPayload;
  }) => void;
  onPipSkipRequest?: (event: { nativeEvent: OnPipSkipRequestPayload }) => void;
};

export interface MpvPlayerViewRef {
  play: () => Promise<void>;
  pause: () => Promise<void>;
  seekTo: (position: number) => Promise<void>;
  seekBy: (offset: number) => Promise<void>;
  setSpeed: (speed: number) => Promise<void>;
  getSpeed: () => Promise<number>;
  isPaused: () => Promise<boolean>;
  getCurrentPosition: () => Promise<number>;
  getDuration: () => Promise<number>;
  startPictureInPicture: () => Promise<void>;
  stopPictureInPicture: () => Promise<void>;
  isPictureInPictureSupported: () => Promise<boolean>;
  isPictureInPictureActive: () => Promise<boolean>;
  // Subtitle controls
  getSubtitleTracks: () => Promise<SubtitleTrack[]>;
  setSubtitleTrack: (trackId: number) => Promise<void>;
  disableSubtitles: () => Promise<void>;
  getCurrentSubtitleTrack: () => Promise<number>;
  addSubtitleFile: (url: string, select?: boolean) => Promise<void>;
  // Subtitle positioning
  setSubtitlePosition: (position: number) => Promise<void>;
  setSubtitleScale: (scale: number) => Promise<void>;
  setSubtitleMarginY: (margin: number) => Promise<void>;
  setSubtitleAlignX: (alignment: "left" | "center" | "right") => Promise<void>;
  setSubtitleAlignY: (alignment: "top" | "center" | "bottom") => Promise<void>;
  setSubtitleFontSize: (size: number) => Promise<void>;
  setSubtitleBackgroundColor: (color: string) => Promise<void>;
  setSubtitleBorderStyle: (
    style: "outline-and-shadow" | "background-box",
  ) => Promise<void>;
  setSubtitleAssOverride: (mode: "no" | "force") => Promise<void>;
  // Audio controls
  getAudioTracks: () => Promise<AudioTrack[]>;
  setAudioTrack: (trackId: number) => Promise<void>;
  getCurrentAudioTrack: () => Promise<number>;
  // Video scaling
  setZoomedToFill: (zoomed: boolean) => Promise<void>;
  isZoomedToFill: () => Promise<boolean>;
  // Technical info
  getTechnicalInfo: () => Promise<TechnicalInfo>;
}

export type SubtitleTrack = {
  id: number;
  title?: string;
  lang?: string;
  selected?: boolean;
};

export type AudioTrack = {
  id: number;
  title?: string;
  lang?: string;
  codec?: string;
  channels?: number;
  selected?: boolean;
};

export type TechnicalInfo = {
  videoWidth?: number;
  videoHeight?: number;
  videoCodec?: string;
  audioCodec?: string;
  fps?: number;
  videoBitrate?: number;
  audioBitrate?: number;
  cacheSeconds?: number;
  droppedFrames?: number;
  /** Active video output driver (read from MPV at runtime) */
  voDriver?: string;
  /** Active hardware decoder (read from MPV at runtime) */
  hwdec?: string;
};
