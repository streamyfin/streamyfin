// Background Downloader
export type {
  ActiveDownload,
  DownloadCompleteEvent,
  DownloadErrorEvent,
  DownloadProgressEvent,
  DownloadStartedEvent,
} from "./background-downloader";
export { default as BackgroundDownloader } from "./background-downloader";
// Type aliases for backward compatibility during migration
// These map old VLC type names to new MPV equivalents
export type {
  AudioTrack,
  MpvPlayerViewProps,
  MpvPlayerViewRef,
  OnErrorEventPayload,
  OnLoadEventPayload,
  OnPlaybackStateChangePayload,
  OnProgressEventPayload,
  OnTracksReadyEventPayload,
  SubtitleTrack,
  SubtitleTrack as TrackInfo,
  VideoSource,
} from "./mpv-player";
// MPV Player - Main exports
export { MpvPlayerView } from "./mpv-player";
