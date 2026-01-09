// Background Downloader
export type {
  ActiveDownload,
  DownloadCompleteEvent,
  DownloadErrorEvent,
  DownloadProgressEvent,
  DownloadStartedEvent,
} from "./background-downloader";
export { default as BackgroundDownloader } from "./background-downloader";

// Streamyfin Player (KSPlayer-based) - GPU acceleration + native PiP (iOS)
export type {
  AudioTrack as SfAudioTrack,
  OnErrorEventPayload as SfOnErrorEventPayload,
  OnLoadEventPayload as SfOnLoadEventPayload,
  OnPictureInPictureChangePayload as SfOnPictureInPictureChangePayload,
  OnPlaybackStateChangePayload as SfOnPlaybackStateChangePayload,
  OnProgressEventPayload as SfOnProgressEventPayload,
  OnTracksReadyEventPayload as SfOnTracksReadyEventPayload,
  SfPlayerViewProps,
  SfPlayerViewRef,
  SubtitleTrack as SfSubtitleTrack,
  VideoSource as SfVideoSource,
} from "./sf-player";
export {
  getHardwareDecode,
  SfPlayerView,
  setHardwareDecode,
} from "./sf-player";

// VLC Player (Android)
export type {
  ChapterInfo,
  NowPlayingMetadata,
  PipStartedPayload,
  PlaybackStatePayload,
  ProgressUpdatePayload,
  TrackInfo,
  VideoLoadStartPayload,
  VideoProgressPayload,
  VideoStateChangePayload,
  VlcPlayerSource,
  VlcPlayerViewProps,
  VlcPlayerViewRef,
} from "./VlcPlayer.types";
export { default as VlcPlayerView } from "./VlcPlayerView";
