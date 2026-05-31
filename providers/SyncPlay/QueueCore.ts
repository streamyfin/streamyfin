/**
 * QueueCore
 *
 * Manages the shared playlist/queue for SyncPlay.
 * Handles queue updates from the server.
 *
 * Based on jellyfin-web's QueueCore.js
 */

import { EventEmitter } from "./Helper";
import type {
  GroupRepeatMode,
  GroupShuffleMode,
  PlayQueueUpdate,
  SyncPlayQueueItem,
} from "./types";

/**
 * QueueCore - Manages the shared playlist
 */
export class QueueCore extends EventEmitter {
  // Queue state
  private lastPlayQueueUpdate: PlayQueueUpdate | null = null;
  private playlist: SyncPlayQueueItem[] = [];

  // Callbacks
  private onStartPlayback: (() => void) | null = null;
  private estimateCurrentTicks: ((ticks: number, when: Date) => number) | null =
    null;

  /**
   * Set the start playback callback
   */
  setStartPlaybackHandler(handler: (() => void) | null): void {
    this.onStartPlayback = handler;
  }

  /**
   * Set the ticks estimator function
   */
  setTicksEstimator(
    estimator: ((ticks: number, when: Date) => number) | null,
  ): void {
    this.estimateCurrentTicks = estimator;
  }

  // ============================================================================
  // Queue State
  // ============================================================================

  /**
   * Get the current playlist
   */
  getPlaylist(): SyncPlayQueueItem[] {
    return [...this.playlist];
  }

  /**
   * Check if playlist is empty
   */
  isPlaylistEmpty(): boolean {
    return this.playlist.length === 0;
  }

  /**
   * Get current playing index
   */
  getCurrentPlaylistIndex(): number {
    return this.lastPlayQueueUpdate?.PlayingItemIndex ?? -1;
  }

  /**
   * Get current playlist item ID
   */
  getCurrentPlaylistItemId(): string | null {
    if (!this.lastPlayQueueUpdate) return null;

    const index = this.lastPlayQueueUpdate.PlayingItemIndex;
    if (index === undefined || index === -1 || index >= this.playlist.length) {
      return null;
    }

    return this.playlist[index]?.PlaylistItemId ?? null;
  }

  /**
   * Get current item's Jellyfin ID (the actual media item ID)
   */
  getCurrentItemId(): string | null {
    if (!this.lastPlayQueueUpdate) return null;

    const index = this.lastPlayQueueUpdate.PlayingItemIndex;
    if (index === undefined || index === -1 || index >= this.playlist.length) {
      return null;
    }

    return this.playlist[index]?.ItemId ?? null;
  }

  /**
   * Get the current item from the playlist
   */
  getCurrentItem(): SyncPlayQueueItem | null {
    if (!this.lastPlayQueueUpdate) return null;

    const index = this.lastPlayQueueUpdate.PlayingItemIndex;
    if (index === undefined || index === -1 || index >= this.playlist.length) {
      return null;
    }

    return this.playlist[index] ?? null;
  }

  /**
   * Get the last update time
   */
  getLastUpdate(): Date | null {
    const lastUpdate = this.lastPlayQueueUpdate?.LastUpdate;
    return lastUpdate ? new Date(lastUpdate) : null;
  }

  /**
   * Get the last update time as timestamp
   */
  getLastUpdateTime(): number {
    const lastUpdate = this.lastPlayQueueUpdate?.LastUpdate;
    return lastUpdate ? new Date(lastUpdate).getTime() : 0;
  }

  /**
   * Get start position ticks
   */
  getStartPositionTicks(): number {
    return this.lastPlayQueueUpdate?.StartPositionTicks ?? 0;
  }

  /**
   * Get repeat mode
   */
  getRepeatMode(): GroupRepeatMode {
    return this.lastPlayQueueUpdate?.RepeatMode ?? "RepeatNone";
  }

  /**
   * Get shuffle mode
   */
  getShuffleMode(): GroupShuffleMode {
    return this.lastPlayQueueUpdate?.ShuffleMode ?? "Sorted";
  }

  /**
   * Get playlist as item IDs
   */
  getPlaylistAsItemIds(): (string | undefined)[] {
    return this.playlist.map((item) => item.ItemId);
  }

  // ============================================================================
  // Queue Updates
  // ============================================================================

  /**
   * Update the play queue from server
   */
  async updatePlayQueue(update: PlayQueueUpdate): Promise<void> {
    // Parse the last update time
    const updateTime = update.LastUpdate
      ? new Date(update.LastUpdate).getTime()
      : 0;

    // Ignore old updates
    if (updateTime <= this.getLastUpdateTime()) {
      console.debug("SyncPlay QueueCore: ignoring old update", update);
      return;
    }

    console.log("SyncPlay QueueCore: processing update", {
      reason: update.Reason,
      position: update.StartPositionTicks,
      index: update.PlayingItemIndex,
    });

    // Check for position change (seek)
    const oldPosition = this.lastPlayQueueUpdate?.StartPositionTicks ?? 0;
    const newPosition = update.StartPositionTicks ?? 0;
    const positionChanged = Math.abs(newPosition - oldPosition) > 10000000; // > 1 second difference

    // Store the update
    this.lastPlayQueueUpdate = update;
    this.playlist = update.Playlist ?? [];

    // Emit update event
    this.emit("queue-update", update);

    // Handle different update reasons
    switch (update.Reason) {
      case "NewPlaylist":
        // Start playback with new playlist
        this.onStartPlayback?.();
        break;

      case "SetCurrentItem":
      case "NextItem":
      case "PreviousItem":
        // Item changed
        this.emit("item-change", this.getCurrentPlaylistItemId());
        break;

      case "RemoveItems":
      case "MoveItem":
      case "Queue":
      case "QueueNext":
        // Playlist modified
        this.emit("playlist-change", this.playlist);
        break;

      case "RepeatMode":
        this.emit("repeat-mode-change", update.RepeatMode);
        break;

      case "ShuffleMode":
        this.emit("shuffle-mode-change", update.ShuffleMode);
        break;

      default:
        console.debug(
          "SyncPlay QueueCore: unhandled update reason",
          update.Reason,
        );
        break;
    }

    // Emit seek if position changed significantly (likely a seek from another device)
    if (positionChanged && update.Reason !== "NewPlaylist") {
      console.log(
        `SyncPlay QueueCore: position changed ${oldPosition} -> ${newPosition}, emitting seek`,
      );
      this.emit("seek", newPosition);
    }
  }

  /**
   * Get estimated start position based on last command
   */
  getEstimatedStartPosition(
    lastCommandPositionTicks: number | null,
    lastCommandWhen: Date | null,
  ): number {
    if (lastCommandPositionTicks !== null && lastCommandWhen !== null) {
      // Use playback command if recent enough
      if (lastCommandWhen.getTime() >= this.getLastUpdateTime()) {
        return (
          this.estimateCurrentTicks?.(
            lastCommandPositionTicks,
            lastCommandWhen,
          ) ?? lastCommandPositionTicks
        );
      }
    }

    // Fall back to queue update position
    const startTicks = this.getStartPositionTicks();
    const lastUpdate = this.getLastUpdate();
    if (lastUpdate) {
      return this.estimateCurrentTicks?.(startTicks, lastUpdate) ?? startTicks;
    }

    return startTicks;
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  /**
   * Clear the queue
   */
  clear(): void {
    this.lastPlayQueueUpdate = null;
    this.playlist = [];
  }

  /**
   * Destroy the queue core
   */
  destroy(): void {
    this.clear();
    this.removeAllListeners();
    this.onStartPlayback = null;
    this.estimateCurrentTicks = null;
  }
}
