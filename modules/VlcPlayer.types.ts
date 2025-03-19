export type PlaybackStatePayload = {
  nativeEvent: {
    target: number;
    state: "Opening" | "Buffering" | "Playing" | "Paused" | "Error";
    currentTime: number;
    duration: number;
    isBuffering: boolean;
    isPlaying: boolean;
  };
};

export type ProgressUpdatePayload = {
  nativeEvent: {
    currentTime: number;
    duration: number;
    isPlaying: boolean;
    isBuffering: boolean;
  };
};

export type VideoLoadStartPayload = {
  nativeEvent: {
    target: number;
  };
};

export type PipStartedPayload = {
  nativeEvent: {
    pipStarted: boolean;
  };
};

export type VideoStateChangePayload = PlaybackStatePayload;

export type VideoProgressPayload = ProgressUpdatePayload;

export type VlcPlayerSource = {
  uri: string;
  type?: string;
  isNetwork?: boolean;
  autoplay?: boolean;
  externalSubtitles: { name: string; DeliveryUrl: string }[];
  initOptions?: any[];
  mediaOptions?: { [key: string]: any };
  startPosition?: number;
};

export type TrackInfo = {
  name: string;
  index: number;
  language?: string;
};

export type ChapterInfo = {
  name: string;
  timeOffset: number;
  duration: number;
};

export type VlcPlayerViewProps = {
  source: VlcPlayerSource;
  style?: Record<string, unknown>;
  progressUpdateInterval?: number;
  paused?: boolean;
  muted?: boolean;
  volume?: number;
  videoAspectRatio?: string;
  onVideoProgress?: (event: ProgressUpdatePayload) => void;
  onVideoStateChange?: (event: PlaybackStatePayload) => void;
  onVideoLoadStart?: (event: VideoLoadStartPayload) => void;
  onVideoLoadEnd?: (event: VideoLoadStartPayload) => void;
  onVideoError?: (event: PlaybackStatePayload) => void;
  onPipStarted?: (event: PipStartedPayload) => void;
};

export interface VlcPlayerViewRef {
  startPictureInPicture: () => Promise<void>;
  play: () => Promise<void>;
  pause: () => Promise<void>;
  stop: () => Promise<void>;
  seekTo: (time: number) => Promise<void>;
  setAudioTrack: (trackIndex: number) => Promise<void>;
  getAudioTracks: () => Promise<TrackInfo[] | null>;
  setSubtitleTrack: (trackIndex: number) => Promise<void>;
  getSubtitleTracks: () => Promise<TrackInfo[] | null>;
  setSubtitleDelay: (delay: number) => Promise<void>;
  setAudioDelay: (delay: number) => Promise<void>;
  takeSnapshot: (path: string, width: number, height: number) => Promise<void>;
  setRate: (rate: number) => Promise<void>;
  nextChapter: () => Promise<void>;
  previousChapter: () => Promise<void>;
  getChapters: () => Promise<ChapterInfo[] | null>;
  setVideoCropGeometry: (geometry: string | null) => Promise<void>;
  getVideoCropGeometry: () => Promise<string | null>;
  setSubtitleURL: (url: string, name: string) => Promise<void>;
}
