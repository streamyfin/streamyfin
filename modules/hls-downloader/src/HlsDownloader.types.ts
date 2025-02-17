import {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client";

export type DownloadState =
  | "QUEUED"
  | "PENDING"
  | "DOWNLOADING"
  | "PAUSED"
  | "DONE"
  | "FAILED"
  | "CANCELLED"
  | "STOPPED";

export interface DownloadMetadata {
  item: BaseItemDto;
  mediaSource: MediaSourceInfo;
  [key: string]: unknown;
}

export type BaseEventPayload = {
  id: string;
  state: DownloadState;
  metadata: DownloadMetadata;
  startTime?: number;
};

export type OnProgressEventPayload = BaseEventPayload & {
  progress: number;
  secondsDownloaded: number;
  secondsTotal: number;
};

export type OnErrorEventPayload = BaseEventPayload & {
  error: string;
  errorCode: number;
  errorDomain: string;
};

export type OnCompleteEventPayload = BaseEventPayload & {
  location: string;
  bytesDownloaded?: number;
};

export type HlsDownloaderModuleEvents = {
  onProgress: (params: OnProgressEventPayload) => void;
  onError: (params: OnErrorEventPayload) => void;
  onComplete: (params: OnCompleteEventPayload) => void;
};

// Export a common interface that can be used by both HLS and regular downloads
export interface DownloadInfo {
  id: string;
  startTime?: number;
  progress: number;
  state: DownloadState;
  secondsDownloaded?: number;
  secondsTotal?: number;
  location?: string;
  error?: string;
  metadata: DownloadMetadata;
}
