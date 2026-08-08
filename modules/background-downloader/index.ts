import type { EventSubscription } from "expo-modules-core";
import { Platform } from "react-native";
import type {
  ActiveDownload,
  DownloadActivityMetadata,
  DownloadCompleteEvent,
  DownloadErrorEvent,
  DownloadProgressEvent,
  DownloadStartedEvent,
} from "./src/BackgroundDownloader.types";
import BackgroundDownloaderModule from "./src/BackgroundDownloaderModule";

export interface BackgroundDownloader {
  startDownload(
    url: string,
    destinationPath?: string,
    metadata?: DownloadActivityMetadata,
  ): Promise<number>;
  enqueueDownload(
    url: string,
    destinationPath?: string,
    metadata?: DownloadActivityMetadata,
  ): Promise<number>;
  cancelDownload(taskId: number): void;
  cancelQueuedDownload(url: string): void;
  cancelAllDownloads(): void;
  getActiveDownloads(): Promise<ActiveDownload[]>;

  /** iOS only; no-op elsewhere. Ends any live activity when turned off. */
  setLiveActivityEnabled(enabled: boolean): void;

  /**
   * iOS only. Absolute path of the App Group directory the Live Activity extension can read, or
   * `null` when unavailable. Poster images must be staged here — the extension has no access to the
   * app's Documents directory.
   */
  getLiveActivityDirectory(): string | null;

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
  async startDownload(
    url: string,
    destinationPath?: string,
    metadata?: DownloadActivityMetadata,
  ): Promise<number> {
    return await BackgroundDownloaderModule.startDownload(
      url,
      destinationPath,
      metadata,
    );
  },

  async enqueueDownload(
    url: string,
    destinationPath?: string,
    metadata?: DownloadActivityMetadata,
  ): Promise<number> {
    return await BackgroundDownloaderModule.enqueueDownload(
      url,
      destinationPath,
      metadata,
    );
  },

  setLiveActivityEnabled(enabled: boolean): void {
    if (Platform.OS !== "ios") return;
    BackgroundDownloaderModule.setLiveActivityEnabled?.(enabled);
  },

  getLiveActivityDirectory(): string | null {
    if (Platform.OS !== "ios") return null;
    return BackgroundDownloaderModule.getLiveActivityDirectory?.() ?? null;
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
  DownloadActivityMetadata,
  DownloadCompleteEvent,
  DownloadErrorEvent,
  DownloadProgressEvent,
  DownloadStartedEvent,
};
