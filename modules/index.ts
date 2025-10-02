import type {
  ActiveDownload,
  DownloadCompleteEvent,
  DownloadErrorEvent,
  DownloadProgressEvent,
  DownloadStartedEvent,
} from "./background-downloader";
import BackgroundDownloader from "./background-downloader";
import {
  ChapterInfo,
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
import VlcPlayerView from "./VlcPlayerView";

export { VlcPlayerView, BackgroundDownloader };
export type {
  VlcPlayerViewProps,
  VlcPlayerViewRef,
  PlaybackStatePayload,
  ProgressUpdatePayload,
  VideoLoadStartPayload,
  VideoStateChangePayload,
  VideoProgressPayload,
  VlcPlayerSource,
  TrackInfo,
  ChapterInfo,
  DownloadProgressEvent,
  DownloadCompleteEvent,
  DownloadErrorEvent,
  DownloadStartedEvent,
  ActiveDownload,
};
