export type PlaybackStatePayload = {
  nativeEvent: {
    target: number;
    state:
      | "Opening"
      | "Buffering"
      | "Playing"
      | "Paused"
      | "Stopped"
      | "Ended"
      | "Error"
      | "Unknown";
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

export type VideoStateChangePayload = PlaybackStatePayload;

export type VideoProgressPayload = ProgressUpdatePayload;

export type VlcPlayerSource = {
  uri: string;
  type?: string;
  isNetwork?: boolean;
  autoplay?: boolean;
  initOptions?: any[];
  mediaOptions?: { [key: string]: any };
};

export type TrackInfo = {
  name: string;
  index: number;
};

export type ChapterInfo = {
  name: string;
  timeOffset: number;
  duration: number;
};

export type VlcPlayerViewProps = {
  source: VlcPlayerSource;
  style?: Object;
  progressUpdateInterval?: number;
  paused?: boolean;
  muted?: boolean;
  volume?: number;
  videoAspectRatio?: string;
  onVideoProgress?: (event: ProgressUpdatePayload) => void;
  onVideoStateChange?: (event: PlaybackStatePayload) => void;
  onVideoLoadStart?: (event: VideoLoadStartPayload) => void;
  onVideoLoadEnd?: (event: VideoLoadStartPayload) => void;
};

export interface VlcPlayerViewRef {
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
  setSubtitleURL: (url: string) => Promise<void>;
}
