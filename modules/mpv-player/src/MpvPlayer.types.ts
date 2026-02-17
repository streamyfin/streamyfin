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
};

export type MpvPlayerViewProps = {
  source?: VideoSource;
  style?: StyleProp<ViewStyle>;
  onLoad?: (event: { nativeEvent: OnLoadEventPayload }) => void;
  onPlaybackStateChange?: (event: {
    nativeEvent: OnPlaybackStateChangePayload;
  }) => void;
  onProgress?: (event: { nativeEvent: OnProgressEventPayload }) => void;
  onError?: (event: { nativeEvent: OnErrorEventPayload }) => void;
  onTracksReady?: (event: { nativeEvent: OnTracksReadyEventPayload }) => void;
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
};
