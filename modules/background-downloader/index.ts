import type { Subscription } from "expo-modules-core";
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
  cancelDownload(taskId: number): void;
  cancelAllDownloads(): void;
  getActiveDownloads(): Promise<ActiveDownload[]>;

  addProgressListener(
    listener: (event: DownloadProgressEvent) => void,
  ): Subscription;

  addCompleteListener(
    listener: (event: DownloadCompleteEvent) => void,
  ): Subscription;

  addErrorListener(listener: (event: DownloadErrorEvent) => void): Subscription;

  addStartedListener(
    listener: (event: DownloadStartedEvent) => void,
  ): Subscription;
}

const BackgroundDownloader: BackgroundDownloader = {
  async startDownload(url: string, destinationPath?: string): Promise<number> {
    return await BackgroundDownloaderModule.startDownload(url, destinationPath);
  },

  cancelDownload(taskId: number): void {
    BackgroundDownloaderModule.cancelDownload(taskId);
  },

  cancelAllDownloads(): void {
    BackgroundDownloaderModule.cancelAllDownloads();
  },

  async getActiveDownloads(): Promise<ActiveDownload[]> {
    return await BackgroundDownloaderModule.getActiveDownloads();
  },

  addProgressListener(
    listener: (event: DownloadProgressEvent) => void,
  ): Subscription {
    return BackgroundDownloaderModule.addListener(
      "onDownloadProgress",
      listener,
    );
  },

  addCompleteListener(
    listener: (event: DownloadCompleteEvent) => void,
  ): Subscription {
    return BackgroundDownloaderModule.addListener(
      "onDownloadComplete",
      listener,
    );
  },

  addErrorListener(
    listener: (event: DownloadErrorEvent) => void,
  ): Subscription {
    return BackgroundDownloaderModule.addListener("onDownloadError", listener);
  },

  addStartedListener(
    listener: (event: DownloadStartedEvent) => void,
  ): Subscription {
    return BackgroundDownloaderModule.addListener(
      "onDownloadStarted",
      listener,
    );
  },
};

export default BackgroundDownloader;

export type {
  DownloadProgressEvent,
  DownloadCompleteEvent,
  DownloadErrorEvent,
  DownloadStartedEvent,
  ActiveDownload,
};
