export type DownloadState =
  | "PENDING"
  | "DOWNLOADING"
  | "PAUSED"
  | "DONE"
  | "FAILED"
  | "STOPPED";

export interface DownloadMetadata {
  Name: string;
  [key: string]: unknown;
}

export type BaseEventPayload = {
  id: string;
  state: DownloadState;
  metadata?: DownloadMetadata;
};

export type OnProgressEventPayload = BaseEventPayload & {
  progress: number;
  bytesDownloaded: number;
  bytesTotal: number;
};

export type OnErrorEventPayload = BaseEventPayload & {
  error: string;
};

export type OnCompleteEventPayload = BaseEventPayload & {
  location: string;
};

export type HlsDownloaderModuleEvents = {
  onProgress: (params: OnProgressEventPayload) => void;
  onError: (params: OnErrorEventPayload) => void;
  onComplete: (params: OnCompleteEventPayload) => void;
};

// Export a common interface that can be used by both HLS and regular downloads
export interface DownloadInfo {
  id: string;
  progress: number;
  state: DownloadState;
  bytesDownloaded?: number;
  bytesTotal?: number;
  location?: string;
  error?: string;
  metadata?: DownloadMetadata;
}
