// Background Downloader
export type {
  ActiveDownload,
  DownloadCompleteEvent,
  DownloadErrorEvent,
  DownloadProgressEvent,
  DownloadStartedEvent,
} from "./background-downloader";
export { default as BackgroundDownloader } from "./background-downloader";

// Music Controls (lock screen / Control Center / system transport controls)
export type {
  MusicNowPlayingMetadata,
  MusicPlaybackState,
  MusicSeekToEvent,
} from "./music-controls";
export { default as MusicControls } from "./music-controls";

// Streamyfin Player (KSPlayer-based) - GPU acceleration + native PiP
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
