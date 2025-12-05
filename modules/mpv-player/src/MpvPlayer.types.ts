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
};

export type OnErrorEventPayload = {
  error: string;
};

export type MpvPlayerModuleEvents = {
  onChange: (params: ChangeEventPayload) => void;
};

export type ChangeEventPayload = {
  value: string;
};

export type MpvPlayerViewProps = {
  url?: string;
  headers?: Record<string, string>;
  autoplay?: boolean;
  style?: StyleProp<ViewStyle>;
  onLoad?: (event: { nativeEvent: OnLoadEventPayload }) => void;
  onPlaybackStateChange?: (event: {
    nativeEvent: OnPlaybackStateChangePayload;
  }) => void;
  onProgress?: (event: { nativeEvent: OnProgressEventPayload }) => void;
  onError?: (event: { nativeEvent: OnErrorEventPayload }) => void;
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
  getSubtitleTracks: () => Promise<SubtitleTrack[]>;
  setSubtitleTrack: (trackId: number) => Promise<void>;
  disableSubtitles: () => Promise<void>;
  getCurrentSubtitleTrack: () => Promise<number>;
  addSubtitleFile: (url: string) => Promise<void>;
  // Subtitle positioning
  setSubtitlePosition: (position: number) => Promise<void>;
  setSubtitleScale: (scale: number) => Promise<void>;
  setSubtitleMarginY: (margin: number) => Promise<void>;
  setSubtitleAlignX: (alignment: "left" | "center" | "right") => Promise<void>;
  setSubtitleAlignY: (alignment: "top" | "center" | "bottom") => Promise<void>;
  setSubtitleFontSize: (size: number) => Promise<void>;
}
export type SubtitleTrack = {
  id: number;
  title?: string;
  lang?: string;
  selected?: boolean;
};
