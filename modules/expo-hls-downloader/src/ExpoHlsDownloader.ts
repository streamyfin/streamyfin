import * as FileSystem from "expo-file-system";
import { type EventSubscription } from "expo-modules-core";
import { useEffect, useState } from "react";

import type {
  OnCompleteEventPayload,
  OnErrorEventPayload,
  OnProgressEventPayload,
} from "./ExpoHlsDownloader.types";
import ExpoHlsDownloaderModule from "./ExpoHlsDownloaderModule";

/**
 * Initiates an HLS download.
 * @param url - The HLS stream URL.
 * @param assetTitle - A title for the asset.
 */
export function downloadHLSAsset(url: string, assetTitle: string): void {
  ExpoHlsDownloaderModule.downloadHLSAsset(url, assetTitle);
}

/**
 * Subscribes to download progress events.
 * @param listener A callback invoked with progress updates.
 * @returns A subscription that can be removed.
 */
export function addProgressListener(
  listener: (event: OnProgressEventPayload) => void
): EventSubscription {
  return ExpoHlsDownloaderModule.addListener("onProgress", listener);
}

/**
 * Subscribes to download error events.
 * @param listener A callback invoked with error details.
 * @returns A subscription that can be removed.
 */
export function addErrorListener(
  listener: (event: OnErrorEventPayload) => void
): EventSubscription {
  return ExpoHlsDownloaderModule.addListener("onError", listener);
}

/**
 * Subscribes to download completion events.
 * @param listener A callback invoked when the download completes.
 * @returns A subscription that can be removed.
 */
export function addCompleteListener(
  listener: (event: OnCompleteEventPayload) => void
): EventSubscription {
  return ExpoHlsDownloaderModule.addListener("onComplete", listener);
}

/**
 * React hook that returns the current download progress (0–1).
 */
export function useDownloadProgress(): number {
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
export function useDownloadError(): string | null {
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
export function useDownloadComplete(
  destinationFileName?: string
): string | null {
  const [location, setLocation] = useState<string | null>(null);

  useEffect(() => {
    console.log("Setting up download complete listener");

    const subscription = addCompleteListener(
      async (event: { location: string }) => {
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
