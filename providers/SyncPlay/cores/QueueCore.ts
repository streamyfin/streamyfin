import type { Api } from "@jellyfin/sdk";
import type {
  PlayQueueUpdate,
  SyncPlayQueueItem,
} from "@jellyfin/sdk/lib/generated-client";
import { WaitForEventDefaultTimeout } from "../constants";
import { throwIfAborted, waitForEventOnce } from "../EventEmitter";
import type { SyncPlayManager } from "../Manager";

export class QueueCore {
  private manager!: SyncPlayManager;
  private lastPlayQueueUpdate: PlayQueueUpdate | null = null;
  private preparation: AbortController | null = null;
  private preparationStarted = false;

  init(manager: SyncPlayManager): void {
    this.manager = manager;
  }

  /** Handle a PlayQueue group update from the server. */
  updatePlayQueue(apiClient: Api, newPlayQueue: PlayQueueUpdate): void {
    try {
      const applied = this.onPlayQueueUpdate(newPlayQueue);
      if (!applied || !this.manager.isSyncPlayEnabled()) return;

      switch (newPlayQueue.Reason) {
        case "NewPlaylist": {
          if (!this.manager.isFollowingGroupPlayback()) {
            void this.manager
              .followGroupPlayback(apiClient)
              .then(() => {
                this.startPlayback(apiClient);
              })
              .catch((error) =>
                console.error("SyncPlay follow group failed", error),
              );
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
          if (
            this.getCurrentItemId() !==
            this.manager.getPlayerWrapper().currentItemId()
          ) {
            this.setCurrentPlaylistItem(
              apiClient,
              this.getCurrentPlaylistItemId(),
            );
          }
          break;
        case "MoveItem":
        case "Queue":
        case "QueueNext":
        case "RepeatMode":
        case "ShuffleMode":
          // These change the server-owned queue, not the selected media.
          break;
        default:
          console.warn(
            "SyncPlay updatePlayQueue: unknown reason",
            newPlayQueue.Reason,
          );
          break;
      }
    } catch (error) {
      console.warn("SyncPlay updatePlayQueue:", error);
      this.manager.emit("toast", "MessageSyncPlayErrorMedia");
    }
  }

  /** Apply a play-queue update to local state. */
  onPlayQueueUpdate(playQueueUpdate: PlayQueueUpdate): boolean {
    const updatedAt = Date.parse(playQueueUpdate.LastUpdate ?? "");
    if (!Number.isFinite(updatedAt)) {
      throw new Error("SyncPlay: invalid queue update timestamp");
    }
    if (updatedAt <= this.getLastUpdateTime()) {
      console.debug("SyncPlay: skipping stale queue snapshot");
      return false;
    }
    // A received queue is already expanded by the sender. Fetching/expanding
    // it again delays navigation and can change its order or duplicate slots.
    // The selected player's normal config builder resolves the one item.
    const playlistItems = playQueueUpdate.Playlist ?? [];
    for (const entry of playlistItems) {
      if (!entry.ItemId || !entry.PlaylistItemId) {
        throw new Error("SyncPlay queue entry is missing an item or slot ID");
      }
    }
    const index = playQueueUpdate.PlayingItemIndex ?? -1;
    if (
      !Number.isInteger(index) ||
      index < -1 ||
      index >= playlistItems.length
    ) {
      throw new Error(
        `SyncPlay queue index ${index} is out of bounds (${playlistItems.length} items)`,
      );
    }

    this.lastPlayQueueUpdate = playQueueUpdate;
    return true;
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
    this.cancelPlaybackPreparation();
    const preparation = new AbortController();
    this.preparation = preparation;
    this.manager.beginPlaybackPreparation();
    waitForEventOnce(
      this.manager,
      "playbackstart",
      WaitForEventDefaultTimeout,
      ["playbackerror"],
      preparation.signal,
    )
      .then(async () => {
        throwIfAborted(preparation.signal);
        this.preparationStarted = true;
        await this.manager
          .getPlaybackCore()
          .preparePlayback(preparation.signal);
        throwIfAborted(preparation.signal);
        this.manager.completePlaybackPreparation();
      })
      .catch((error) => {
        if (preparation.signal.aborted) return;
        console.error("SyncPlay player startup failed", origin, error);
        if (this.manager.isSyncPlayEnabled()) {
          this.manager.emit("toast", "MessageSyncPlayErrorMedia");
        }
        this.manager.haltGroupPlayback(apiClient);
      })
      .finally(() => {
        if (this.preparation === preparation) {
          this.preparation = null;
          this.preparationStarted = false;
        }
      });
  }

  cancelActivePreparation(): void {
    // A new queue can be waiting for a new player while the old one detaches.
    // Only cancel a handshake that has already acquired the outgoing player.
    if (!this.preparationStarted) return;
    this.cancelPlaybackPreparation();
    this.manager.completePlaybackPreparation();
  }

  cancelPlaybackPreparation(): void {
    this.preparation?.abort();
    this.preparation = null;
    this.preparationStarted = false;
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
    const itemId = this.getCurrentItemId();
    if (!itemId) {
      console.error("SyncPlay: queue has no selected item", {
        index: this.getCurrentPlaylistIndex(),
      });
      this.manager.emit("toast", "MessageSyncPlayErrorMedia");
      return;
    }
    console.debug("SyncPlay: opening queue item", {
      itemId,
      index: this.getCurrentPlaylistIndex(),
      count: this.getPlaylist().length,
    });

    // Estimate where to start playback from. Prefer the last playback
    // command if newer than the queue update (playback ticks change
    // more often than queue position).
    const playbackCommand = this.manager.getLastPlaybackCommand();
    let startPositionTicks = 0;

    if (
      playbackCommand &&
      playbackCommand.PlaylistItemId === this.getCurrentPlaylistItemId() &&
      Date.parse(playbackCommand.EmittedAt) >= this.getLastUpdateTime()
    ) {
      startPositionTicks =
        playbackCommand.Command === "Unpause"
          ? this.manager
              .getPlaybackCore()
              .estimateCurrentTicks(
                playbackCommand.PositionTicks ?? 0,
                new Date(playbackCommand.When),
              )
          : (playbackCommand.PositionTicks ?? 0);
    } else {
      startPositionTicks = this.lastPlayQueueUpdate?.IsPlaying
        ? this.manager
            .getPlaybackCore()
            .estimateCurrentTicks(
              this.getStartPositionTicks(),
              this.getLastUpdate()!,
            )
        : this.getStartPositionTicks();
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
        this.manager.notifyPlaybackError(error);
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
    if (!playlistItemId) {
      this.cancelPlaybackPreparation();
      this.manager.completePlaybackPreparation();
      this.manager.getPlayerWrapper().localStop();
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
    return (
      this.getPlaylist()[this.getCurrentPlaylistIndex()]?.PlaylistItemId ?? null
    );
  }

  getCurrentItemId(): string | null {
    return this.getPlaylist()[this.getCurrentPlaylistIndex()]?.ItemId ?? null;
  }

  getPlaylist(): readonly SyncPlayQueueItem[] {
    return this.lastPlayQueueUpdate?.Playlist ?? [];
  }

  isPlaylistEmpty(): boolean {
    return this.getPlaylist().length === 0;
  }

  getLastUpdate(): Date | null {
    if (!this.lastPlayQueueUpdate) return null;
    return new Date(this.lastPlayQueueUpdate.LastUpdate ?? "");
  }

  getLastUpdateTime(): number {
    if (!this.lastPlayQueueUpdate) return 0;
    return Date.parse(this.lastPlayQueueUpdate.LastUpdate ?? "");
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
    this.cancelPlaybackPreparation();
    this.lastPlayQueueUpdate = null;
  }

  destroy(): void {
    this.clear();
  }
}

export default QueueCore;
