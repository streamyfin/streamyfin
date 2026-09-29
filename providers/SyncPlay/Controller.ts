/**
 * SyncPlay Controller — public playback API exposed to consumers.
 *
 * Methods are fire-and-forget by design: SyncPlay HTTP responses don't
 * carry useful info (the real state arrives via WebSocket broadcast).
 * Request failures are reported; native playback events never call this API.
 */

import type {
  BaseItemDto,
  PlayRequestDto,
} from "@jellyfin/sdk/lib/generated-client/models";
import { getSyncPlayApi } from "@jellyfin/sdk/lib/utils/api";
import type { SyncPlayManager } from "./Manager";
import {
  getItemsForPlayback,
  type TranslateOptions,
  translateItemsForPlayback,
} from "./transport/queueTranslation";

type PlayOptions = TranslateOptions & {
  items?: BaseItemDto[];
  startIndex?: number;
  startPositionTicks?: number;
  /** Caller supplied the exact queue; do not auto-expand a single episode. */
  exactQueue?: boolean;
};

export class Controller {
  private manager!: SyncPlayManager;

  init(manager: SyncPlayManager): void {
    this.manager = manager;
  }

  private send(action: string, request: () => Promise<unknown>): void {
    void Promise.resolve()
      .then(request)
      .catch((error) => {
        console.error(`SyncPlay Controller.${action} failed`, error);
        this.manager.emit("toast", "MessageSyncPlayErrorMedia");
      });
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
    this.send("unpause", () =>
      getSyncPlayApi(this.manager.getApiClient()).syncPlayUnpause(),
    );
  }

  /** Pause the group's playback. */
  pause(): void {
    this.manager.markPendingPlaybackCommand("Pause");
    this.send("pause", () =>
      getSyncPlayApi(this.manager.getApiClient()).syncPlayPause(),
    );
    // Pause locally too so the user sees instant feedback.
    this.manager.getPlayerWrapper().localPause();
  }

  /** Seek the group's playback. `positionTicks` is in ticks (1ms = 10000 ticks). */
  seek(positionTicks: number): void {
    this.send("seek", () =>
      getSyncPlayApi(this.manager.getApiClient()).syncPlaySeek({
        seekRequestDto: { PositionTicks: positionTicks },
      }),
    );
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
    try {
      const user = this.manager.getUser();
      if (!user?.Id)
        throw new Error("SyncPlay: no authenticated user for playback");
      const sourceItems = options.items
        ? options.items
        : await getItemsForPlayback(api, user, options.ids ?? []);
      const items = options.exactQueue
        ? sourceItems
        : await translateItemsForPlayback(api, user, sourceItems, options);
      const request: PlayRequestDto = {
        PlayingQueue: items.flatMap((item) => (item.Id ? [item.Id] : [])),
        PlayingItemPosition: options.startIndex ?? 0,
        StartPositionTicks: options.startPositionTicks ?? 0,
      };
      await getSyncPlayApi(api).syncPlaySetNewQueue({
        playRequestDto: request,
      });
    } catch (error) {
      console.error("SyncPlay Controller.play failed", error);
      throw error;
    }
  }

  /** Stop the group's playback. */
  stop(): void {
    this.send("stop", () =>
      getSyncPlayApi(this.manager.getApiClient()).syncPlayStop(),
    );
  }

  /** Jump to the next item in the group's queue. */
  nextItem(): void {
    this.send("nextItem", () =>
      getSyncPlayApi(this.manager.getApiClient()).syncPlayNextItem({
        nextItemRequestDto: {
          PlaylistItemId:
            this.manager.getQueueCore().getCurrentPlaylistItemId() ?? undefined,
        },
      }),
    );
  }

  /** Jump to the previous item in the group's queue. */
  previousItem(): void {
    this.send("previousItem", () =>
      getSyncPlayApi(this.manager.getApiClient()).syncPlayPreviousItem({
        previousItemRequestDto: {
          PlaylistItemId:
            this.manager.getQueueCore().getCurrentPlaylistItemId() ?? undefined,
        },
      }),
    );
  }

  /** Jump to a specific item in the queue by playlist item id. */
  setCurrentPlaylistItem(playlistItemId: string): void {
    this.send("setCurrentPlaylistItem", () =>
      getSyncPlayApi(this.manager.getApiClient()).syncPlaySetPlaylistItem({
        setPlaylistItemRequestDto: { PlaylistItemId: playlistItemId },
      }),
    );
  }

  /**
   * Jump the group to `item`. If the item is already in the current queue
   * (by `Id`), dispatches a cheap `SetPlaylistItem` so the queue stays
   * intact. Otherwise starts a new playback request, which replaces the
   * group's queue (matches jellyfin-web's playbackManager.play behavior
   * when picking an episode from a different series/season).
   */
  goToItem(item: BaseItemDto): void {
    const itemId = item.Id;
    if (!itemId) {
      console.warn("SyncPlay Controller.goToItem called without item.Id");
      return;
    }
    const queueEntry = this.manager
      .getQueueCore()
      .getPlaylist()
      .find((q) => q.ItemId === itemId);
    if (queueEntry?.PlaylistItemId) {
      this.setCurrentPlaylistItem(queueEntry.PlaylistItemId);
      return;
    }
    this.send("goToItem", () =>
      this.play({
        ids: [itemId],
        startPositionTicks: item.UserData?.PlaybackPositionTicks ?? 0,
      }),
    );
  }
}

export default Controller;
