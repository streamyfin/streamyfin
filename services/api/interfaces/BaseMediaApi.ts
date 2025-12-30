import type { BaseMediaEntity } from "@/models/common/types";
import type { PlaybackProgress } from "./types";

/**
 * Base media API interface
 * Common operations shared across all media types (music, video, etc.)
 */
export interface BaseMediaApi {
  /**
   * Get a single item by ID
   */
  getItem(id: string): Promise<BaseMediaEntity | null>;

  /**
   * Get multiple items by their IDs
   */
  getItems(ids: string[]): Promise<BaseMediaEntity[]>;

  /**
   * Mark an item as favorite
   */
  markFavorite(itemId: string): Promise<void>;

  /**
   * Unmark an item as favorite
   */
  unmarkFavorite(itemId: string): Promise<void>;

  /**
   * Mark an item as played
   */
  markPlayed(itemId: string, datePlayed?: Date): Promise<void>;

  /**
   * Mark an item as unplayed
   */
  markUnplayed(itemId: string): Promise<void>;

  /**
   * Update playback progress for an item
   */
  updatePlaybackProgress(
    itemId: string,
    progress: PlaybackProgress,
  ): Promise<void>;
}
