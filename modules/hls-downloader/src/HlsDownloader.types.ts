export type OnProgressEventPayload = {
  progress: number;
  state: "PENDING" | "DOWNLOADING" | "PAUSED" | "DONE" | "FAILED" | "STOPPED";
  id: string;
  bytesDownloaded: number;
  bytesTotal: number;
};

export type OnErrorEventPayload = {
  error: string;
};

export type OnCompleteEventPayload = {
  location: string;
};

export type HlsDownloaderModuleEvents = {
  onProgress: (params: OnProgressEventPayload) => void;
  onError: (params: OnErrorEventPayload) => void;
  onComplete: (params: OnCompleteEventPayload) => void;
};
