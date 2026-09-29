/**
 * SyncPlay Controller — public playback API exposed to consumers.
 *
 * Methods are fire-and-forget by design: SyncPlay HTTP responses don't
 * carry useful info (the real state arrives via WebSocket broadcast).
 * Wrap calls in try/catch so transient network errors don't reach the UI.
 */

import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getSyncPlayApi } from "@jellyfin/sdk/lib/utils/api";
import type { SyncPlayManager } from "./Manager";
import {
  getItemsForPlayback,
  type TranslateOptions,
  translateItemsForPlayback,
} from "./transport/queueTranslation";

export interface PlayOptions extends TranslateOptions {
  items?: BaseItemDto[];
  ids?: string[];
  startIndex?: number;
  startPositionTicks?: number;
}

export class Controller {
  private manager!: SyncPlayManager;

  init(manager: SyncPlayManager): void {
    this.manager = manager;
  }

  /** Toggle play/pause for the whole group. */
  playPause(): void {
    if (this.manager.isPlaying()) {
      this.pause();
    } else {
      this.unpause();
    }
  }

  /** Resume the group's playback. */
  unpause(): void {
    this.manager.markPendingPlaybackCommand("Unpause");
    try {
      getSyncPlayApi(this.manager.getApiClient()).syncPlayUnpause();
    } catch (error) {
      console.error("SyncPlay Controller.unpause failed", error);
    }
  }

  /** Pause the group's playback. */
  pause(): void {
    this.manager.markPendingPlaybackCommand("Pause");
    try {
      getSyncPlayApi(this.manager.getApiClient()).syncPlayPause();
    } catch (error) {
      console.error("SyncPlay Controller.pause failed", error);
    }
    // Pause locally too so the user sees instant feedback.
    this.manager.getPlayerWrapper().localPause();
  }

  /** Seek the group's playback. `positionTicks` is in ticks (1ms = 10000 ticks). */
  seek(positionTicks: number): void {
    try {
      getSyncPlayApi(this.manager.getApiClient()).syncPlaySeek({
        seekRequestDto: { PositionTicks: positionTicks },
      });
    } catch (error) {
      console.error("SyncPlay Controller.seek failed", error);
    }
  }

  /**
   * Start playback in the group. Expands containers (Series, Season,
   * BoxSet, Playlist, single Episode w/ autoplay) into the real
   * playable queue before broadcasting.
   *
   * Resolves once the SetNewQueue request completes; the server then
   * broadcasts a PlayQueue update and Play command to every member.
   */
  async play(options: PlayOptions): Promise<void> {
    const api = this.manager.getApiClient();

    const sendPlayRequest = async (items: BaseItemDto[]) => {
      const queue = items
        .map((item) => item.Id)
        .filter((id): id is string => typeof id === "string");
      await getSyncPlayApi(api).syncPlaySetNewQueue({
        playRequestDto: {
          PlayingQueue: queue,
          PlayingItemPosition: options.startIndex ?? 0,
          StartPositionTicks: options.startPositionTicks ?? 0,
        },
      });
    };

    try {
      const sourceItems = options.items
        ? options.items
        : await getItemsForPlayback(api, options.ids ?? []);
      const items = await translateItemsForPlayback(api, sourceItems, options);
      await sendPlayRequest(items);
    } catch (error) {
      console.error("SyncPlay Controller.play failed", error);
      throw error;
    }
  }

  /** Stop the group's playback. */
  stop(): void {
    try {
      getSyncPlayApi(this.manager.getApiClient()).syncPlayStop();
    } catch (error) {
      console.error("SyncPlay Controller.stop failed", error);
    }
  }

  /** Jump to the next item in the group's queue. */
  nextItem(): void {
    try {
      getSyncPlayApi(this.manager.getApiClient()).syncPlayNextItem({
        nextItemRequestDto: {
          PlaylistItemId: this.manager
            .getQueueCore()
            .getCurrentPlaylistItemId(),
        } as unknown as Parameters<
          ReturnType<typeof getSyncPlayApi>["syncPlayNextItem"]
        >[0]["nextItemRequestDto"],
      });
    } catch (error) {
      console.error("SyncPlay Controller.nextItem failed", error);
    }
  }

  /** Jump to the previous item in the group's queue. */
  previousItem(): void {
    try {
      getSyncPlayApi(this.manager.getApiClient()).syncPlayPreviousItem({
        previousItemRequestDto: {
          PlaylistItemId: this.manager
            .getQueueCore()
            .getCurrentPlaylistItemId(),
        } as unknown as Parameters<
          ReturnType<typeof getSyncPlayApi>["syncPlayPreviousItem"]
        >[0]["previousItemRequestDto"],
      });
    } catch (error) {
      console.error("SyncPlay Controller.previousItem failed", error);
    }
  }

  /** Jump to a specific item in the queue by playlist item id. */
  setCurrentPlaylistItem(playlistItemId: string): void {
    try {
      getSyncPlayApi(this.manager.getApiClient()).syncPlaySetPlaylistItem({
        setPlaylistItemRequestDto: { PlaylistItemId: playlistItemId },
      });
    } catch (error) {
      console.error("SyncPlay Controller.setCurrentPlaylistItem failed", error);
    }
  }

  /**
   * Jump the group to `item`. If the item is already in the current queue
   * (by `Id`), dispatches a cheap `SetPlaylistItem` so the queue stays
   * intact. Otherwise starts a new playback request, which replaces the
   * group's queue (matches jellyfin-web's playbackManager.play behavior
   * when picking an episode from a different series/season).
   */
  goToItem(item: BaseItemDto): void {
    if (!item.Id) {
      console.warn("SyncPlay Controller.goToItem called without item.Id");
      return;
    }
    const queueEntry = this.manager
      .getQueueCore()
      .getPlaylist()
      .find((q) => q.Id === item.Id);
    if (queueEntry?.PlaylistItemId) {
      this.setCurrentPlaylistItem(queueEntry.PlaylistItemId);
      return;
    }
    void this.play({
      ids: [item.Id],
      startPositionTicks: item.UserData?.PlaybackPositionTicks ?? 0,
    });
  }
}

export default Controller;
