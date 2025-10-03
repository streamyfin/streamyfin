import { File } from "expo-file-system";
import { getAllDownloadedItems, getDownloadedItemById } from "./database";

/**
 * Delete a video file from the file system
 */
export function deleteVideoFile(filePath: string): void {
  try {
    const videoFile = new File("", filePath);
    if (videoFile.exists) {
      videoFile.delete();
    }
  } catch (error) {
    console.error("Failed to delete video file:", error);
    throw error;
  }
}

/**
 * Get the size of a downloaded item by ID
 */
export function getDownloadedItemSize(id: string): number {
  const item = getDownloadedItemById(id);
  return item?.videoFileSize || 0;
}

/**
 * Calculate total size of all downloaded items
 */
export function calculateTotalDownloadedSize(): number {
  const items = getAllDownloadedItems();
  return items.reduce((sum, item) => sum + (item.videoFileSize || 0), 0);
}
