/**
 * SyncPlay QueueCore — tracks the group's playlist.
 *
 * Responsibilities:
 *  - Handle `PlayQueue` group updates (NewPlaylist, SetCurrentItem,
 *    NextItem, PreviousItem, RemoveItems, etc.)
 *  - Resolve the server's flat list of ItemIds into full `BaseItemDto`s
 *    (with PlaylistItemId glued on for SyncPlay requests)
 *  - Expose `currentPlaylistItemId` — required by every SyncPlay
 *    request (Ready, Buffering, Seek) so the server can ignore stale
 *    ones from before the playlist moved
 *  - On NewPlaylist, ask the server we're ready by sending a Buffering
 *    request after the local player emits `playbackstart`
 */

import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { getSyncPlayApi } from "@jellyfin/sdk/lib/utils/api";
import { TicksPerMillisecond, WaitForEventDefaultTimeout } from "../constants";
import { EventEmitter, waitForEventOnce } from "../EventEmitter";
import type { SyncPlayManager } from "../Manager";
import {
  getItemsForPlayback,
  translateItemsForPlayback,
} from "../transport/queueTranslation";
import type {
  PlayQueueUpdate,
  PlayQueueUpdateReason,
  SyncPlayQueueItem,
} from "../types";

export class QueueCore extends EventEmitter {
  private manager!: SyncPlayManager;
  private lastPlayQueueUpdate: PlayQueueUpdate | null = null;
  /** Playable items with `PlaylistItemId` glued on. */
  private playlist: BaseItemDto[] = [];

  init(manager: SyncPlayManager): void {
    this.manager = manager;
  }

  /** Handle a PlayQueue group update from the server. */
  updatePlayQueue(apiClient: Api, newPlayQueue: PlayQueueUpdate): void {
    (newPlayQueue as unknown as { LastUpdate: Date }).LastUpdate = new Date(
      newPlayQueue.LastUpdate as unknown as string,
    );

    if (
      (newPlayQueue.LastUpdate as unknown as Date).getTime() <=
      this.getLastUpdateTime()
    ) {
      console.debug("SyncPlay updatePlayQueue: ignoring old update");
      return;
    }

    this.onPlayQueueUpdate(apiClient, newPlayQueue)
      .then(() => {
        if (
          (newPlayQueue.LastUpdate as unknown as Date).getTime() <
          this.getLastUpdateTime()
        ) {
          console.warn("SyncPlay updatePlayQueue: trying to apply old update");
          return;
        }

        const reason = newPlayQueue.Reason as PlayQueueUpdateReason;
        switch (reason) {
          case "NewPlaylist": {
            if (!this.manager.isFollowingGroupPlayback()) {
              this.manager.followGroupPlayback(apiClient).then(() => {
                this.startPlayback(apiClient);
              });
            } else {
              this.startPlayback(apiClient);
            }
            break;
          }
          case "SetCurrentItem":
          case "NextItem":
          case "PreviousItem": {
            const playlistItemId = this.getCurrentPlaylistItemId();
            this.setCurrentPlaylistItem(apiClient, playlistItemId);
            break;
          }
          case "RemoveItems":
          case "MoveItem":
          case "Queue":
          case "QueueNext":
          case "RepeatMode":
          case "ShuffleMode":
            // Video-focused: we don't expose repeat/shuffle/queue mutation
            // controls in the RN UI yet, so these reasons just update our
            // local snapshot (already done by onPlayQueueUpdate) without
            // triggering any local action.
            break;
          default:
            console.warn(
              "SyncPlay updatePlayQueue: unknown reason",
              newPlayQueue.Reason,
            );
            break;
        }
      })
      .catch((error) => {
        console.warn("SyncPlay updatePlayQueue:", error);
      });
  }

  /** Apply a play-queue update to local state. */
  async onPlayQueueUpdate(
    apiClient: Api,
    playQueueUpdate: PlayQueueUpdate,
  ): Promise<void> {
    const itemIds = (playQueueUpdate.Playlist ?? [])
      .map((queueItem: SyncPlayQueueItem) => queueItem.ItemId)
      .filter((id): id is string => typeof id === "string");

    if (!itemIds.length) {
      this.lastPlayQueueUpdate = playQueueUpdate;
      this.playlist = [];
      return;
    }

    const fetched = await getItemsForPlayback(apiClient, itemIds);
    const items = await translateItemsForPlayback(apiClient, fetched, {
      ids: itemIds,
    });

    if (
      this.lastPlayQueueUpdate &&
      (playQueueUpdate.LastUpdate as unknown as Date).getTime() <=
        this.getLastUpdateTime()
    ) {
      throw new Error("Trying to apply old update");
    }

    // Glue PlaylistItemId from the server's playlist entries onto each
    // resolved item. The server-assigned IDs are what every SyncPlay
    // request needs to identify the queue slot.
    const playlistItems = playQueueUpdate.Playlist ?? [];
    for (let i = 0; i < items.length && i < playlistItems.length; i++) {
      items[i].PlaylistItemId = playlistItems[i].PlaylistItemId;
    }

    this.lastPlayQueueUpdate = playQueueUpdate;
    this.playlist = items;
  }

  /**
   * Send a Ready request once the local player begins playback. The
   * server uses this to wait until every member is buffered before
   * issuing the next Unpause.
   *
   * On timeout (player never starts), halt group playback so the rest
   * of the group can proceed without us.
   */
  scheduleReadyRequestOnPlaybackStart(apiClient: Api, origin: string): void {
    waitForEventOnce(
      this.manager,
      "playbackstart",
      WaitForEventDefaultTimeout,
      ["playbackerror"],
    )
      .then(() => {
        console.debug(
          "SyncPlay scheduleReadyRequestOnPlaybackStart: notifying server",
        );
        const playerWrapper = this.manager.getPlayerWrapper();
        playerWrapper.localPause();

        const currentPosition = playerWrapper.currentTime();
        const currentPositionTicks = Math.round(
          currentPosition * TicksPerMillisecond,
        );
        const isPlaying = playerWrapper.isPlaying();
        const now = this.manager.getTimeSync().localDateToRemote(new Date());

        try {
          getSyncPlayApi(apiClient).syncPlayReady({
            readyRequestDto: {
              When: now.toISOString(),
              PositionTicks: currentPositionTicks,
              IsPlaying: isPlaying,
              PlaylistItemId: this.getCurrentPlaylistItemId() ?? undefined,
            },
          });
        } catch (error) {
          console.error("SyncPlay syncPlayReady failed", error);
        }
      })
      .catch((error) => {
        console.error(
          "Timed out waiting for 'playbackstart' event!",
          origin,
          error,
        );
        if (!this.manager.isSyncPlayEnabled()) {
          this.manager.emit("toast", "MessageSyncPlayErrorMedia");
        }
        this.manager.haltGroupPlayback(apiClient);
      });
  }

  /** Start local playback by navigating to the player screen for the current item. */
  startPlayback(apiClient: Api): void {
    if (!this.manager.isFollowingGroupPlayback()) {
      console.debug("SyncPlay startPlayback: ignoring, not following playback");
      return;
    }

    if (this.isPlaylistEmpty()) {
      console.debug("SyncPlay startPlayback: empty playlist");
      return;
    }

    // Estimate where to start playback from. Prefer the last playback
    // command if newer than the queue update (playback ticks change
    // more often than queue position).
    const playbackCommand = this.manager.getLastPlaybackCommand();
    let startPositionTicks = 0;

    if (
      playbackCommand &&
      (
        playbackCommand as unknown as { EmittedAt: Date }
      ).EmittedAt?.getTime() >= this.getLastUpdateTime()
    ) {
      startPositionTicks = this.manager
        .getPlaybackCore()
        .estimateCurrentTicks(
          playbackCommand.PositionTicks ?? 0,
          (playbackCommand as unknown as { When: Date }).When,
        );
    } else {
      startPositionTicks = this.manager
        .getPlaybackCore()
        .estimateCurrentTicks(
          this.getStartPositionTicks(),
          (this.getLastUpdate() ?? new Date()) as Date,
        );
    }

    const serverId = apiClient.deviceInfo?.id ?? "";

    this.scheduleReadyRequestOnPlaybackStart(apiClient, "startPlayback");

    this.manager
      .getPlayerWrapper()
      .localPlay({
        ids: this.getPlaylistAsItemIds(),
        startPositionTicks,
        startIndex: this.getCurrentPlaylistIndex(),
        serverId,
      })
      .catch((error: unknown) => {
        console.error("SyncPlay startPlayback: localPlay failed", error);
        this.manager.emit("toast", "MessageSyncPlayErrorMedia");
      });
  }

  /** Navigate to a specific item in the queue. */
  setCurrentPlaylistItem(apiClient: Api, playlistItemId: string | null): void {
    if (!this.manager.isFollowingGroupPlayback()) {
      console.debug(
        "SyncPlay setCurrentPlaylistItem: ignoring, not following playback",
      );
      return;
    }

    this.scheduleReadyRequestOnPlaybackStart(
      apiClient,
      "setCurrentPlaylistItem",
    );

    this.manager.getPlayerWrapper().localSetCurrentPlaylistItem(playlistItemId);
  }

  // -- getters ---------------------------------------------------------------

  getCurrentPlaylistIndex(): number {
    return this.lastPlayQueueUpdate?.PlayingItemIndex ?? -1;
  }

  getCurrentPlaylistItemId(): string | null {
    if (!this.lastPlayQueueUpdate) return null;
    const index = this.lastPlayQueueUpdate.PlayingItemIndex ?? -1;
    if (index === -1) return null;
    return this.playlist[index]?.PlaylistItemId ?? null;
  }

  getPlaylist(): BaseItemDto[] {
    return this.playlist.slice(0);
  }

  isPlaylistEmpty(): boolean {
    return this.playlist.length === 0;
  }

  getLastUpdate(): Date | null {
    if (!this.lastPlayQueueUpdate) return null;
    return this.lastPlayQueueUpdate.LastUpdate as unknown as Date;
  }

  getLastUpdateTime(): number {
    if (!this.lastPlayQueueUpdate) return 0;
    return (this.lastPlayQueueUpdate.LastUpdate as unknown as Date).getTime();
  }

  getStartPositionTicks(): number {
    return this.lastPlayQueueUpdate?.StartPositionTicks ?? 0;
  }

  getPlaylistAsItemIds(): (string | undefined)[] {
    if (!this.lastPlayQueueUpdate) return [];
    return (this.lastPlayQueueUpdate.Playlist ?? []).map((q) => q.ItemId);
  }

  // -- teardown --------------------------------------------------------------

  /** Clear cached playlist. Called on group disable so a re-join starts clean. */
  clear(): void {
    this.lastPlayQueueUpdate = null;
    this.playlist = [];
  }

  destroy(): void {
    this.clear();
    this.removeAllListeners();
  }
}

export default QueueCore;
