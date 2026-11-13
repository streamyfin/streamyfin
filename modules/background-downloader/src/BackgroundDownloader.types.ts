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
  /**
   * `running` for the transfer in flight, `queued` for entries waiting behind it, `paused` for
   * downloads the user paused (these hold the queue until resumed or cancelled).
   */
  state?: "running" | "queued" | "paused";
}

/**
 * What a pause did: `kept` stopped the transfer with its bytes saved, `discarded` stopped it but
 * resuming starts again from the first byte (a transcode, or a server without range requests),
 * `failed` found nothing to pause, usually because the transfer had just ended.
 */
export type PauseDownloadResult = "kept" | "discarded" | "failed";

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
  pauseDownload(taskId: number): Promise<PauseDownloadResult>;
  resumeDownload(
    itemId: string,
    url: string,
    destinationPath?: string,
    metadata?: DownloadActivityMetadata,
    headers?: Record<string, string>,
  ): Promise<number>;
  cancelPausedDownload(itemId: string, destinationPath?: string): void;
  restorePausedDownload(
    itemId: string,
    url: string,
    destinationPath?: string,
  ): void;
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
