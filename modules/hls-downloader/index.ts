import * as FileSystem from "expo-file-system";
import { type EventSubscription } from "expo-modules-core";
import { useEffect, useState } from "react";

import type {
  DownloadInfo,
  DownloadMetadata,
  OnCompleteEventPayload,
  OnErrorEventPayload,
  OnProgressEventPayload,
} from "./src/HlsDownloader.types";
import HlsDownloaderModule from "./src/HlsDownloaderModule";

/**
 * Initiates an HLS download.
 * @param id - A unique identifier for the download.
 * @param url - The HLS stream URL.
 * @param metadata - Additional metadata for the download.
 */
function downloadHLSAsset(
  id: string,
  url: string,
  metadata: DownloadMetadata
): void {
  HlsDownloaderModule.downloadHLSAsset(id, url, metadata);
}

/**
 *  Cancels an ongoing download.
 * @param id - The unique identifier for the download.
 * @returns void
 */
async function cancelDownload(id: string): Promise<void> {
  return HlsDownloaderModule.cancelDownload(id);
}

/**
 * Subscribes to download progress events.
 * @param listener A callback invoked with progress updates.
 * @returns A subscription that can be removed.
 */
function addProgressListener(
  listener: (event: OnProgressEventPayload) => void
): EventSubscription {
  return HlsDownloaderModule.addListener("onProgress", listener);
}

/**
 * Subscribes to download error events.
 * @param listener A callback invoked with error details.
 * @returns A subscription that can be removed.
 */
function addErrorListener(
  listener: (event: OnErrorEventPayload) => void
): EventSubscription {
  return HlsDownloaderModule.addListener("onError", listener);
}

/**
 * Subscribes to download completion events.
 * @param listener A callback invoked when the download completes.
 * @returns A subscription that can be removed.
 */
function addCompleteListener(
  listener: (event: OnCompleteEventPayload) => void
): EventSubscription {
  return HlsDownloaderModule.addListener("onComplete", listener);
}

/**
 * React hook that returns the current download progress (0–1).
 */
function useDownloadProgress(): number {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const subscription = addProgressListener((event) => {
      setProgress(event.progress);
    });
    return () => subscription.remove();
  }, []);
  return progress;
}

/**
 * React hook that returns the latest download error (or null if none).
 */
function useDownloadError(): string | null {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const subscription = addErrorListener((event) => {
      setError(event.error);
    });
    return () => subscription.remove();
  }, []);
  return error;
}

export {
  downloadHLSAsset,
  useDownloadError,
  useDownloadProgress,
  addCompleteListener,
  addErrorListener,
  addProgressListener,
  HlsDownloaderModule,
  cancelDownload,
};
