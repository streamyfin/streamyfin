import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import {
  getDownloadedAudioById,
  updateDownloadedTrack,
} from "@/providers/AudioPlayer/database";
import {
  getDownloadedItemById,
  updateDownloadedItem,
} from "@/providers/Downloads/database";

/**
 * Local UserData that can be modified offline
 * Subset of Jellyfin's UserItemDataDto
 */
export interface LocalUserData {
  /** Whether the item is marked as favorite */
  IsFavorite?: boolean;
  /** Whether the item has been played/watched */
  Played?: boolean;
  /** Number of times the item has been played */
  PlayCount?: number;
  /** Playback position in ticks (10,000 ticks = 1ms) */
  PlaybackPositionTicks?: number;
  /** Percentage of the item that has been played (0-100) */
  PlayedPercentage?: number;
  /** Last played date (ISO string) */
  LastPlayedDate?: string;
}

/**
 * Merge local UserData with item's existing UserData
 * Local UserData takes precedence when set
 */
export function mergeUserData(
  item: BaseItemDto,
  localUserData?: LocalUserData,
): BaseItemDto {
  if (!localUserData) return item;

  return {
    ...item,
    UserData: {
      ...item.UserData,
      ...localUserData,
    },
  };
}

/**
 * Update local UserData for a video item (movie/episode)
 */
export function updateVideoLocalUserData(
  itemId: string,
  updates: Partial<LocalUserData>,
): boolean {
  const downloadedItem = getDownloadedItemById(itemId);
  if (!downloadedItem) {
    console.warn(`[LocalUserData] Video item ${itemId} not found in downloads`);
    return false;
  }

  // Merge updates with existing UserData
  const updatedItem = {
    ...downloadedItem,
    item: mergeUserData(downloadedItem.item, updates),
  };

  updateDownloadedItem(itemId, updatedItem);
  return true;
}

/**
 * Update local UserData for an audio item (track)
 */
export function updateAudioLocalUserData(
  itemId: string,
  updates: Partial<LocalUserData>,
): boolean {
  const downloadedItem = getDownloadedAudioById(itemId);
  if (!downloadedItem) {
    console.warn(`[LocalUserData] Audio item ${itemId} not found in downloads`);
    return false;
  }

  // Merge updates with existing UserData
  const updatedItem = {
    ...downloadedItem,
    item: mergeUserData(downloadedItem.item, updates),
  };

  updateDownloadedTrack(itemId, updatedItem);
  return true;
}

/**
 * Update local UserData for any item (auto-detects type)
 */
export function updateLocalUserData(
  itemId: string,
  updates: Partial<LocalUserData>,
): boolean {
  // Try video first
  if (updateVideoLocalUserData(itemId, updates)) {
    return true;
  }

  // Try audio
  if (updateAudioLocalUserData(itemId, updates)) {
    return true;
  }

  console.warn(`[LocalUserData] Item ${itemId} not found in any database`);
  return false;
}

/**
 * Get local UserData for a video item
 */
export function getVideoLocalUserData(
  itemId: string,
): LocalUserData | undefined {
  const downloadedItem = getDownloadedItemById(itemId);
  if (!downloadedItem) return undefined;

  return downloadedItem.item.UserData as LocalUserData | undefined;
}

/**
 * Get local UserData for an audio item
 */
export function getAudioLocalUserData(
  itemId: string,
): LocalUserData | undefined {
  const downloadedItem = getDownloadedAudioById(itemId);
  if (!downloadedItem) return undefined;

  return downloadedItem.item.UserData as LocalUserData | undefined;
}

/**
 * Get local UserData for any item (auto-detects type)
 */
export function getLocalUserData(itemId: string): LocalUserData | undefined {
  return (
    getVideoLocalUserData(itemId) || getAudioLocalUserData(itemId) || undefined
  );
}

/**
 * Batch update UserData for multiple items
 * Useful for syncing back to server
 */
export function batchUpdateLocalUserData(
  updates: Array<{ itemId: string; userData: Partial<LocalUserData> }>,
): { success: number; failed: number } {
  let success = 0;
  let failed = 0;

  for (const { itemId, userData } of updates) {
    if (updateLocalUserData(itemId, userData)) {
      success++;
    } else {
      failed++;
    }
  }

  console.log(
    `[LocalUserData] Batch update: ${success} success, ${failed} failed`,
  );
  return { success, failed };
}
