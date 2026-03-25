import type { EventSubscription } from "expo-modules-core";
import type {
  ActiveDownload,
  DownloadCompleteEvent,
  DownloadErrorEvent,
  DownloadPausedEvent,
  DownloadProgressEvent,
  DownloadResumedEvent,
  DownloadStartedEvent,
} from "./src/BackgroundDownloader.types";
import BackgroundDownloaderModule from "./src/BackgroundDownloaderModule";

export interface BackgroundDownloader {
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

  addProgressListener(
    listener: (event: DownloadProgressEvent) => void,
  ): EventSubscription;

  addCompleteListener(
    listener: (event: DownloadCompleteEvent) => void,
  ): EventSubscription;

  addErrorListener(
    listener: (event: DownloadErrorEvent) => void,
  ): EventSubscription;

  addStartedListener(
    listener: (event: DownloadStartedEvent) => void,
  ): EventSubscription;

  addPausedListener(
    listener: (event: DownloadPausedEvent) => void,
  ): EventSubscription;

  addResumedListener(
    listener: (event: DownloadResumedEvent) => void,
  ): EventSubscription;
}

const BackgroundDownloader: BackgroundDownloader = {
  async startDownload(url: string, destinationPath?: string): Promise<number> {
    return await BackgroundDownloaderModule.startDownload(url, destinationPath);
  },

  async enqueueDownload(
    url: string,
    destinationPath?: string,
  ): Promise<number> {
    return await BackgroundDownloaderModule.enqueueDownload(
      url,
      destinationPath,
    );
  },

  cancelDownload(taskId: number): void {
    BackgroundDownloaderModule.cancelDownload(taskId);
  },

  cancelQueuedDownload(url: string): void {
    BackgroundDownloaderModule.cancelQueuedDownload(url);
  },

  cancelAllDownloads(): void {
    BackgroundDownloaderModule.cancelAllDownloads();
  },

  pauseDownload(taskId: number): void {
    BackgroundDownloaderModule.pauseDownload(taskId);
  },

  async resumeDownload(taskId: number): Promise<number> {
    return await BackgroundDownloaderModule.resumeDownload(taskId);
  },

  async downloadChunk(
    urlString: string,
    destinationPath: string,
    startByte: number,
    endByte: number,
  ): Promise<number> {
    return await BackgroundDownloaderModule.downloadChunk(
      urlString,
      destinationPath,
      startByte,
      endByte,
    );
  },

  async getActiveDownloads(): Promise<ActiveDownload[]> {
    return await BackgroundDownloaderModule.getActiveDownloads();
  },

  addProgressListener(
    listener: (event: DownloadProgressEvent) => void,
  ): EventSubscription {
    return BackgroundDownloaderModule.addListener(
      "onDownloadProgress",
      listener,
    );
  },

  addCompleteListener(
    listener: (event: DownloadCompleteEvent) => void,
  ): EventSubscription {
    return BackgroundDownloaderModule.addListener(
      "onDownloadComplete",
      listener,
    );
  },

  addErrorListener(
    listener: (event: DownloadErrorEvent) => void,
  ): EventSubscription {
    return BackgroundDownloaderModule.addListener("onDownloadError", listener);
  },

  addStartedListener(
    listener: (event: DownloadStartedEvent) => void,
  ): EventSubscription {
    return BackgroundDownloaderModule.addListener(
      "onDownloadStarted",
      listener,
    );
  },

  addPausedListener(
    listener: (event: DownloadPausedEvent) => void,
  ): EventSubscription {
    return BackgroundDownloaderModule.addListener("onDownloadPaused", listener);
  },

  addResumedListener(
    listener: (event: DownloadResumedEvent) => void,
  ): EventSubscription {
    return BackgroundDownloaderModule.addListener(
      "onDownloadResumed",
      listener,
    );
  },
};

export default BackgroundDownloader;

export type {
  ActiveDownload,
  DownloadCompleteEvent,
  DownloadErrorEvent,
  DownloadPausedEvent,
  DownloadProgressEvent,
  DownloadResumedEvent,
  DownloadStartedEvent,
};
