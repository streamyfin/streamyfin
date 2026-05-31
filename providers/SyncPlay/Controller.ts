/**
 * SyncPlay Controller
 *
 * Exposes SyncPlay API calls to external modules.
 * Provides methods for controlling synchronized playback.
 *
 * Based on jellyfin-web's Controller.js
 */

import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { getSyncPlayApi } from "@jellyfin/sdk/lib/utils/api";
import {
  getItemsForPlayback,
  msToTicks,
  translateItemsForPlayback,
} from "./Helper";
import type { SyncPlayManager } from "./Manager";
import type { QueueCore } from "./QueueCore";
import type { GroupRepeatMode, GroupShuffleMode, PlayOptions } from "./types";

/**
 * SyncPlay Controller - External API for controlling SyncPlay
 */
export class SyncPlayController {
  private api: Api;
  private manager: SyncPlayManager;
  private queueCore: QueueCore;

  constructor(api: Api, manager: SyncPlayManager, queueCore: QueueCore) {
    this.api = api;
    this.manager = manager;
    this.queueCore = queueCore;
  }

  // ============================================================================
  // Playback Control
  // ============================================================================

  /**
   * Toggle play/pause
   */
  playPause(): void {
    // Use server group state (with pending in-flight command preferred) as
    // the source of truth. The local player can lag the group by hundreds of
    // ms while a scheduled command is pending, so reading `playerControls`
    // here would cause rapid taps to send duplicate / wrong commands and
    // desync other clients.
    const state = this.manager.getEffectivePlayState();
    console.log(`SyncPlay Controller: playPause - effectiveState=${state}`);
    if (state === "Playing") {
      console.log("SyncPlay Controller: requesting PAUSE");
      this.pause();
    } else {
      console.log("SyncPlay Controller: requesting UNPAUSE");
      this.unpause();
    }
  }

  /**
   * Request unpause (play)
   */
  async unpause(): Promise<void> {
    // Drop duplicate rapid taps while a previous request is still in flight
    // (cleared when the server broadcasts back via SyncPlayCommand, or after
    // a safety timeout).
    if (this.manager.getPendingPlaybackCommand() === "Unpause") {
      console.debug("SyncPlay Controller: unpause ignored — already pending");
      return;
    }
    this.manager.markPendingPlaybackCommand("Unpause");
    try {
      console.log("SyncPlay Controller: sending syncPlayUnpause to server");
      const syncPlayApi = getSyncPlayApi(this.api);
      await syncPlayApi.syncPlayUnpause();
      console.log("SyncPlay Controller: syncPlayUnpause sent successfully");
    } catch (error) {
      console.error("SyncPlay Controller: failed to unpause", error);
    }
  }

  /**
   * Request pause
   */
  async pause(): Promise<void> {
    if (this.manager.getPendingPlaybackCommand() === "Pause") {
      console.debug("SyncPlay Controller: pause ignored — already pending");
      return;
    }
    this.manager.markPendingPlaybackCommand("Pause");
    try {
      console.log("SyncPlay Controller: sending syncPlayPause to server");
      const syncPlayApi = getSyncPlayApi(this.api);
      await syncPlayApi.syncPlayPause();
      console.log("SyncPlay Controller: syncPlayPause sent successfully");

      // Also pause locally for immediate feedback
      this.manager.getPlayerControls()?.pause();
    } catch (error) {
      console.error("SyncPlay Controller: failed to pause", error);
    }
  }

  /**
   * Request seek to position
   */
  async seek(positionTicks: number): Promise<void> {
    try {
      console.log(
        `SyncPlay Controller: sending syncPlaySeek to ${positionTicks} ticks`,
      );
      const syncPlayApi = getSyncPlayApi(this.api);
      await syncPlayApi.syncPlaySeek({
        seekRequestDto: {
          PositionTicks: positionTicks,
        },
      });
      console.log("SyncPlay Controller: syncPlaySeek sent successfully");

      // Also seek locally for immediate feedback
      const positionMs = positionTicks / 10000;
      this.manager.getPlayerControls()?.seekTo(positionMs);
    } catch (error) {
      console.error("SyncPlay Controller: failed to seek", error);
    }
  }

  /**
   * Request seek to position in milliseconds
   */
  async seekMs(positionMs: number): Promise<void> {
    console.log(`SyncPlay Controller: seekMs to ${positionMs}ms`);
    await this.seek(msToTicks(positionMs));
  }

  /**
   * Request stop
   */
  async stop(): Promise<void> {
    try {
      const syncPlayApi = getSyncPlayApi(this.api);
      await syncPlayApi.syncPlayStop();
    } catch (error) {
      console.error("SyncPlay Controller: failed to stop", error);
    }
  }

  // ============================================================================
  // Queue Control
  // ============================================================================

  /**
   * Start playback with a new SyncPlay group queue.
   *
   * Mirrors jellyfin-web's `Controller.play`:
   *
   *   - If the caller passed full `items` objects, translate them directly
   *     (Series → episodes, BoxSet → children, etc.).
   *   - Otherwise fetch the items by ID first (`getItemsForPlayback`), then
   *     translate.
   *   - Send the translated, real playable IDs to
   *     `syncPlaySetNewQueue` so every group member receives a queue of
   *     playable items — not container IDs (Series / Season / BoxSet) that
   *     receivers like jellyfin-web silently drop.
   *
   * `startIndex` / `startPositionTicks` default to 0, same as jellyfin-web.
   */
  async play(options: PlayOptions): Promise<void> {
    const { items, ids, startIndex = 0, startPositionTicks = 0 } = options;

    if ((!ids || ids.length === 0) && (!items || items.length === 0)) {
      console.error("SyncPlay Controller: no items or ids to play");
      return;
    }

    try {
      // Step 1 — resolve to a list of BaseItemDto. Prefer the caller-supplied
      // items (no extra round trip), fall back to a fetch by IDs.
      const sourceItems: BaseItemDto[] =
        items && items.length > 0
          ? items
          : await getItemsForPlayback(this.api, ids ?? []);

      if (!sourceItems.length) {
        console.error(
          "SyncPlay Controller: getItemsForPlayback returned no items",
        );
        return;
      }

      // Step 2 — expand Series / Season / BoxSet / Playlist / single-Episode
      // into the real playable queue.
      const translated = await translateItemsForPlayback(
        this.api,
        sourceItems,
        { ids, queryOptions: {} },
      );

      const queueIds = translated
        .map((item) => item.Id)
        .filter((id): id is string => !!id);

      if (!queueIds.length) {
        console.error(
          "SyncPlay Controller: translateItemsForPlayback produced empty queue",
        );
        return;
      }

      console.log(
        `SyncPlay Controller: sending syncPlaySetNewQueue (${queueIds.length} item${queueIds.length === 1 ? "" : "s"}, startIndex=${startIndex})`,
      );

      // Step 3 — broadcast the resolved queue to the group.
      const syncPlayApi = getSyncPlayApi(this.api);
      await syncPlayApi.syncPlaySetNewQueue({
        playRequestDto: {
          PlayingQueue: queueIds,
          PlayingItemPosition: startIndex,
          StartPositionTicks: startPositionTicks,
        },
      });
    } catch (error) {
      // Surface the server response body when available — a SetNewQueue
      // that 4xx's silently is the most common "why didn't the other
      // client start?" cause. Without the body we'd just see a generic
      // axios error and have no way to tell whether it was a permission
      // problem, an unknown item ID, or the server rejecting the queue.
      const err = error as {
        response?: { status?: number; data?: unknown };
        message?: string;
      };
      console.error("SyncPlay Controller: failed to set new queue", {
        status: err?.response?.status,
        data: err?.response?.data,
        message: err?.message,
      });
    }
  }

  /**
   * Set current item in playlist
   */
  async setCurrentPlaylistItem(playlistItemId: string): Promise<void> {
    try {
      const syncPlayApi = getSyncPlayApi(this.api);
      await syncPlayApi.syncPlaySetPlaylistItem({
        setPlaylistItemRequestDto: {
          PlaylistItemId: playlistItemId,
        },
      });
    } catch (error) {
      console.error("SyncPlay Controller: failed to set playlist item", error);
    }
  }

  /**
   * Play next item
   */
  async nextItem(): Promise<void> {
    try {
      const syncPlayApi = getSyncPlayApi(this.api);
      await syncPlayApi.syncPlayNextItem({
        nextItemRequestDto: {
          PlaylistItemId:
            this.queueCore.getCurrentPlaylistItemId() ?? undefined,
        },
      });
    } catch (error) {
      console.error("SyncPlay Controller: failed to play next", error);
    }
  }

  /**
   * Play previous item
   */
  async previousItem(): Promise<void> {
    try {
      const syncPlayApi = getSyncPlayApi(this.api);
      await syncPlayApi.syncPlayPreviousItem({
        previousItemRequestDto: {
          PlaylistItemId:
            this.queueCore.getCurrentPlaylistItemId() ?? undefined,
        },
      });
    } catch (error) {
      console.error("SyncPlay Controller: failed to play previous", error);
    }
  }

  /**
   * Add items to queue
   */
  async queue(
    itemIds: string[],
    mode: "Queue" | "QueueNext" = "Queue",
  ): Promise<void> {
    try {
      const syncPlayApi = getSyncPlayApi(this.api);
      await syncPlayApi.syncPlayQueue({
        queueRequestDto: {
          ItemIds: itemIds,
          Mode: mode,
        },
      });
    } catch (error) {
      console.error("SyncPlay Controller: failed to queue items", error);
    }
  }

  /**
   * Add items to play next
   */
  async queueNext(itemIds: string[]): Promise<void> {
    await this.queue(itemIds, "QueueNext");
  }

  /**
   * Remove items from playlist
   */
  async removeFromPlaylist(playlistItemIds: string[]): Promise<void> {
    try {
      const syncPlayApi = getSyncPlayApi(this.api);
      await syncPlayApi.syncPlayRemoveFromPlaylist({
        removeFromPlaylistRequestDto: {
          PlaylistItemIds: playlistItemIds,
        },
      });
    } catch (error) {
      console.error(
        "SyncPlay Controller: failed to remove from playlist",
        error,
      );
    }
  }

  /**
   * Move item in playlist
   */
  async movePlaylistItem(
    playlistItemId: string,
    newIndex: number,
  ): Promise<void> {
    try {
      const syncPlayApi = getSyncPlayApi(this.api);
      await syncPlayApi.syncPlayMovePlaylistItem({
        movePlaylistItemRequestDto: {
          PlaylistItemId: playlistItemId,
          NewIndex: newIndex,
        },
      });
    } catch (error) {
      console.error("SyncPlay Controller: failed to move playlist item", error);
    }
  }

  // ============================================================================
  // Playback Settings
  // ============================================================================

  /**
   * Set repeat mode
   */
  async setRepeatMode(mode: GroupRepeatMode): Promise<void> {
    try {
      const syncPlayApi = getSyncPlayApi(this.api);
      await syncPlayApi.syncPlaySetRepeatMode({
        setRepeatModeRequestDto: {
          Mode: mode,
        },
      });
    } catch (error) {
      console.error("SyncPlay Controller: failed to set repeat mode", error);
    }
  }

  /**
   * Set shuffle mode
   */
  async setShuffleMode(mode: GroupShuffleMode): Promise<void> {
    try {
      const syncPlayApi = getSyncPlayApi(this.api);
      await syncPlayApi.syncPlaySetShuffleMode({
        setShuffleModeRequestDto: {
          Mode: mode,
        },
      });
    } catch (error) {
      console.error("SyncPlay Controller: failed to set shuffle mode", error);
    }
  }

  /**
   * Toggle shuffle mode
   */
  async toggleShuffleMode(): Promise<void> {
    const currentMode = this.queueCore.getShuffleMode();
    const newMode: GroupShuffleMode =
      currentMode === "Sorted" ? "Shuffle" : "Sorted";
    await this.setShuffleMode(newMode);
  }
}
