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
 * Checks for existing downloads.
 * Returns an array of downloads with additional fields:
 * id, progress, bytesDownloaded, bytesTotal, and state.
 */
async function checkForExistingDownloads(): Promise<DownloadInfo[]> {
  return HlsDownloaderModule.checkForExistingDownloads();
}

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

/**
 * Moves a file from a temporary URI to a permanent location in the document directory.
 * @param tempFileUri The temporary file URI returned by the native module.
 * @param newFilename The desired filename (with extension) for the persisted file.
 * @returns A promise that resolves with the new file URI.
 */
async function persistDownloadedFile(
  tempFileUri: string,
  newFilename: string
): Promise<string> {
  const newUri = FileSystem.documentDirectory + newFilename;
  try {
    await FileSystem.moveAsync({
      from: tempFileUri,
      to: newUri,
    });
    console.log("File persisted to:", newUri);
    return newUri;
  } catch (error) {
    console.error("Error moving file:", error);
    throw error;
  }
}

/**
 * React hook that returns the completion location of the download.
 * If a destinationFileName is provided, the hook will move the downloaded file
 * to the document directory under that name, then return the new URI.
 *
 * @param destinationFileName Optional filename (with extension) to persist the file.
 * @returns The final file URI or null if not completed.
 */
function useDownloadComplete(destinationFileName?: string): string | null {
  const [location, setLocation] = useState<string | null>(null);

  useEffect(() => {
    console.log("Setting up download complete listener");

    const subscription = addCompleteListener(
      async (event: OnCompleteEventPayload) => {
        console.log("Download complete event received:", event);
        console.log("Original download location:", event.location);

        if (destinationFileName) {
          console.log(
            "Attempting to persist file with name:",
            destinationFileName
          );
          try {
            const newLocation = await persistDownloadedFile(
              event.location,
              destinationFileName
            );
            console.log("File successfully persisted to:", newLocation);
            setLocation(newLocation);
          } catch (error) {
            console.error("Failed to persist file:", error);
            console.error("Error details:", {
              originalLocation: event.location,
              destinationFileName,
              error: error instanceof Error ? error.message : error,
            });
          }
        } else {
          console.log(
            "No destination filename provided, using original location"
          );
          setLocation(event.location);
        }
      }
    );

    return () => {
      console.log("Cleaning up download complete listener");
      subscription.remove();
    };
  }, [destinationFileName]);

  return location;
}

export {
  downloadHLSAsset,
  checkForExistingDownloads,
  useDownloadComplete,
  useDownloadError,
  useDownloadProgress,
  addCompleteListener,
  addErrorListener,
  addProgressListener,
  HlsDownloaderModule,
  cancelDownload,
};
