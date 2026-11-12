import type { EventSubscription } from "expo-modules-core";
import { Platform } from "react-native";
import type {
  ActiveDownload,
  DownloadActivityMetadata,
  DownloadCompleteEvent,
  DownloadErrorEvent,
  DownloadProgressEvent,
  DownloadStartedEvent,
  PauseDownloadResult,
} from "./src/BackgroundDownloader.types";
import BackgroundDownloaderModule from "./src/BackgroundDownloaderModule";

export interface BackgroundDownloader {
  /**
   * @param headers Custom proxy auth headers for a server behind an access
   * gateway. Not persisted natively, so a queued download that outlives the
   * process has to be restarted from the app.
   */
  startDownload(
    url: string,
    destinationPath?: string,
    metadata?: DownloadActivityMetadata,
    headers?: Record<string, string>,
  ): Promise<number>;
  enqueueDownload(
    url: string,
    destinationPath?: string,
    metadata?: DownloadActivityMetadata,
    headers?: Record<string, string>,
  ): Promise<number>;
  cancelDownload(taskId: number): void;
  cancelQueuedDownload(url: string): void;
  cancelAllDownloads(): void;
  /**
   * Stops a running transfer, keeping its bytes where the server allows. A paused download holds
   * the queue behind it until it is resumed or cancelled.
   */
  pauseDownload(taskId: number): Promise<PauseDownloadResult>;
  /**
   * Continues a paused download, or starts it again when its bytes could not be kept. Takes what
   * the download was enqueued with, so it also works when native has forgotten the pause (an
   * Android process death). Resolves with the new task id.
   */
  resumeDownload(
    itemId: string,
    url: string,
    destinationPath?: string,
    metadata?: DownloadActivityMetadata,
    headers?: Record<string, string>,
  ): Promise<number>;
  /** Drops a paused download and what it saved, and lets the queue move on. */
  cancelPausedDownload(itemId: string, destinationPath?: string): void;
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
    headers?: Record<string, string>,
  ): Promise<number> {
    return await BackgroundDownloaderModule.startDownload(
      url,
      destinationPath,
      metadata,
      headers,
    );
  },

  async enqueueDownload(
    url: string,
    destinationPath?: string,
    metadata?: DownloadActivityMetadata,
    headers?: Record<string, string>,
  ): Promise<number> {
    return await BackgroundDownloaderModule.enqueueDownload(
      url,
      destinationPath,
      metadata,
      headers,
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

  async pauseDownload(taskId: number): Promise<PauseDownloadResult> {
    return await BackgroundDownloaderModule.pauseDownload(taskId);
  },

  async resumeDownload(
    itemId: string,
    url: string,
    destinationPath?: string,
    metadata?: DownloadActivityMetadata,
    headers?: Record<string, string>,
  ): Promise<number> {
    return await BackgroundDownloaderModule.resumeDownload(
      itemId,
      url,
      destinationPath,
      metadata,
      headers,
    );
  },

  cancelPausedDownload(itemId: string, destinationPath?: string): void {
    BackgroundDownloaderModule.cancelPausedDownload(itemId, destinationPath);
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
  PauseDownloadResult,
};
