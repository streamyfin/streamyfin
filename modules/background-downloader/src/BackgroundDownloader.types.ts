import type { EventSubscription } from "expo-modules-core";

export interface DownloadProgressEvent {
  taskId: number;
  bytesWritten: number;
  totalBytes: number;
  progress: number;
}

export interface DownloadCompleteEvent {
  taskId: number;
  filePath: string;
  url: string;
}

export interface DownloadErrorEvent {
  taskId: number;
  error: string;
  /** Whether the download can be resumed from where it stopped */
  isResumable: boolean;
  /** Number of bytes successfully downloaded before the error */
  bytesDownloaded: number;
}

export interface DownloadStartedEvent {
  taskId: number;
  url: string;
}

export interface DownloadPausedEvent {
  taskId: number;
  url: string;
  bytesDownloaded: number;
}

export interface DownloadResumedEvent {
  taskId: number;
  url: string;
  bytesDownloaded: number;
}

export interface ActiveDownload {
  taskId: number;
  url: string;
  state: "running" | "suspended" | "canceling" | "completed" | "unknown";
}

export interface BackgroundDownloaderModuleType {
  startDownload(url: string, destinationPath?: string): Promise<number>;
  enqueueDownload(url: string, destinationPath?: string): Promise<number>;
  cancelDownload(taskId: number): void;
  cancelQueuedDownload(url: string): void;
  cancelAllDownloads(): void;
  pauseDownload(taskId: number): void;
  resumeDownload(taskId: number): Promise<number>;
  downloadChunk(
    urlString: string,
    destinationPath: string,
    startByte: number,
    endByte: number,
  ): Promise<number>;
  getActiveDownloads(): Promise<ActiveDownload[]>;
  addListener(
    eventName: string,
    listener: (event: any) => void,
  ): EventSubscription;
}
