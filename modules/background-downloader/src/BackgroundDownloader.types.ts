import type { EventSubscription } from "expo-modules-core";

export interface DownloadProgressEvent {
  taskId: number;
  bytesWritten: number;
  totalBytes: number;
  progress: number;
  /** Jellyfin item id, echoed from the metadata passed at enqueue time (absent without metadata). */
  itemId?: string;
}

export interface DownloadCompleteEvent {
  taskId: number;
  filePath: string;
  url: string;
  /** Jellyfin item id, echoed from the metadata passed at enqueue time (absent without metadata). */
  itemId?: string;
}

export interface DownloadErrorEvent {
  taskId: number;
  error: string;
  /** Jellyfin item id, echoed from the metadata passed at enqueue time (absent without metadata). */
  itemId?: string;
}

export interface DownloadStartedEvent {
  taskId: number;
  url: string;
  /** Jellyfin item id, echoed from the metadata passed at enqueue time (absent without metadata). */
  itemId?: string;
}

export interface ActiveDownload {
  /** Native task id; `-1` for queued entries, which have no task yet. */
  taskId: number;
  url: string;
  /** Jellyfin item id, echoed from the metadata passed at enqueue time (absent without metadata). */
  itemId?: string;
  destinationPath?: string;
  /** `running` for the transfer in flight, `queued` for entries waiting behind it. */
  state?: "running" | "queued";
}

/**
 * Everything the iOS Live Activity needs in order to render without a JS runtime.
 *
 * The activity is driven from the native URLSession delegate, which keeps working when iOS has torn
 * down the JS runtime — so nothing here can be resolved lazily later. In particular `labels` carries
 * pre-translated strings, keeping i18n in `translations/*.json` instead of duplicating it in Swift.
 *
 * iOS only; ignored on Android.
 */
export interface DownloadActivityMetadata {
  itemId: string;
  title: string;
  subtitle: string;
  /** File name inside the directory returned by `getLiveActivityDirectory()`. */
  posterFileName?: string;
  /** Fallback total used when the server sends no Content-Length (transcoded downloads). */
  estimatedTotalBytes?: number;
  /** Localized labels keyed by state: `downloading` | `completed` | `failed` | `queued`. */
  labels: Record<string, string>;
}

export interface BackgroundDownloaderModuleType {
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
  /** iOS only — absent from the Android module. */
  setLiveActivityEnabled?(enabled: boolean): void;
  /** iOS only — absent from the Android module. */
  getLiveActivityDirectory?(): string | null;
  addListener(
    eventName: string,
    listener: (event: any) => void,
  ): EventSubscription;
}
