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
}

export interface DownloadStartedEvent {
  taskId: number;
  url: string;
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
  getActiveDownloads(): Promise<ActiveDownload[]>;
  addListener(
    eventName: string,
    listener: (event: any) => void,
  ): EventSubscription;
}
