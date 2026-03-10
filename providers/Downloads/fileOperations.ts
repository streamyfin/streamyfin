import { Directory, File, Paths } from "expo-file-system";
import { getAllDownloadedItems, getDownloadedItemById } from "./database";
import { deleteSafFile, isSafUri } from "./storagePath";
import type { DownloadedItem } from "./types";
import { filePathToUri } from "./utils";

/**
 * Delete a video file and all associated files (subtitles, trickplay, etc.)
 * Handles both file:// and content:// (SAF) URIs.
 */
export async function deleteVideoFile(filePath: string): Promise<void> {
  try {
    if (isSafUri(filePath)) {
      // SAF content:// URIs must be deleted through the SAF API
      await deleteSafFile(filePath);
      return;
    }
    const videoFile = new File(filePathToUri(filePath));
    if (videoFile.exists) {
      videoFile.delete();
      console.log(`[DELETE] Video file deleted: ${filePath}`);
    }
  } catch (error) {
    console.error("Failed to delete video file:", error);
    throw error;
  }
}

/**
 * Delete all associated files for a downloaded item
 * Includes: video, subtitles, trickplay images
 */
export async function deleteAllAssociatedFiles(
  item: DownloadedItem,
): Promise<void> {
  try {
    // Delete video file (handles both file:// and content:// URIs)
    if (item.videoFilePath) {
      await deleteVideoFile(item.videoFilePath);
    }

    // Delete subtitle files
    if (item.mediaSource?.MediaStreams) {
      for (const stream of item.mediaSource.MediaStreams) {
        if (
          stream.Type === "Subtitle" &&
          stream.DeliveryMethod === "External" &&
          stream.DeliveryUrl
        ) {
          try {
            const subtitleFilename = stream.DeliveryUrl.split("/").pop();
            if (subtitleFilename) {
              const subtitleFile = new File(Paths.document, subtitleFilename);
              if (subtitleFile.exists) {
                subtitleFile.delete();
                console.log(`[DELETE] Subtitle deleted: ${subtitleFilename}`);
              }
            }
          } catch (error) {
            console.error("[DELETE] Failed to delete subtitle:", error);
          }
        }
      }
    }

    // Delete trickplay directory
    if (item.trickPlayData?.path) {
      try {
        const trickplayDirName = item.trickPlayData.path.split("/").pop();
        if (trickplayDirName) {
          const trickplayDir = new Directory(Paths.document, trickplayDirName);
          if (trickplayDir.exists) {
            trickplayDir.delete();
            console.log(
              `[DELETE] Trickplay directory deleted: ${trickplayDirName}`,
            );
          }
        }
      } catch (error) {
        console.error("[DELETE] Failed to delete trickplay directory:", error);
      }
    }
    // Delete SAF copy if it exists (separate from videoFilePath)
    if (item.safFilePath && item.safFilePath !== item.videoFilePath) {
      try {
        await deleteSafFile(item.safFilePath);
      } catch (error) {
        console.error("[DELETE] Failed to delete SAF copy:", error);
      }
    }
  } catch (error) {
    console.error("[DELETE] Error deleting associated files:", error);
    throw error;
  }
}

/**
 * Get the size of a downloaded item by ID
 * Includes video file size and trickplay data size
 */
export function getDownloadedItemSize(id: string): number {
  const item = getDownloadedItemById(id);
  if (!item) return 0;

  const videoSize = item.videoFileSize || 0;
  const trickplaySize = item.trickPlayData?.size || 0;

  return videoSize + trickplaySize;
}

/**
 * Calculate total size of all downloaded items
 */
export function calculateTotalDownloadedSize(): number {
  const items = getAllDownloadedItems();
  return items.reduce((sum, item) => sum + (item.videoFileSize || 0), 0);
}
