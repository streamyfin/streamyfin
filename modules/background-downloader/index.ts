import type { EventSubscription } from "expo-modules-core";
import type {
  ActiveDownload,
  DownloadCompleteEvent,
  DownloadErrorEvent,
  DownloadProgressEvent,
  DownloadStartedEvent,
} from "./src/BackgroundDownloader.types";
import BackgroundDownloaderModule from "./src/BackgroundDownloaderModule";

export interface BackgroundDownloader {
  startDownload(url: string, destinationPath?: string): Promise<number>;
  enqueueDownload(url: string, destinationPath?: string): Promise<number>;
  cancelDownload(taskId: number): void;
  cancelQueuedDownload(url: string): void;
  cancelAllDownloads(): void;
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
};

export default BackgroundDownloader;

export type {
  ActiveDownload,
  DownloadCompleteEvent,
  DownloadErrorEvent,
  DownloadProgressEvent,
  DownloadStartedEvent,
};
