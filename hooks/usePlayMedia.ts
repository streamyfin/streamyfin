import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { useSetAtom } from "jotai";
import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Alert } from "react-native";
import { useNativePlayer } from "@/providers/NativePlayerProvider";
import { useSyncPlay } from "@/providers/SyncPlayProvider";
import { shuffleQueueAtom } from "@/utils/atoms/shuffleQueue";
import { isLiveTvItem } from "@/utils/jellyfin/media/isLiveTvItem";
import { isPlayableItem } from "@/utils/jellyfin/media/isPlayableItem";
import type { PlayRequest } from "@/utils/nativePlayer/playRequest";
import { resetStillWatchingSession } from "@/utils/stillWatching";

interface PlayMediaOptions {
  /** Shuffle sets the queue right before playing — don't clear it. */
  preserveShuffleQueue?: boolean;
  /** Complete ordered video queue; the requested item selects its start index. */
  queueItemIds?: string[];
  /**
   * Pass when available: lets the chooser refuse an item that has nothing to
   * play before a player is opened, and keep Live TV (Program/TvChannel) out
   * of a SyncPlay group.
   */
  item?: BaseItemDto | null;
}

/**
 * Single entry point for starting video playback on mobile and TV: hands the
 * request to the presented native player, or to the SyncPlay group when in
 * one. A play the player cannot start (unsupported platform, config or
 * present failure) is explained by the provider, which is the only one that
 * can tell a failure from a request a newer one replaced.
 */
export const usePlayMedia = () => {
  const setShuffleQueue = useSetAtom(shuffleQueueAtom);
  const { presentFromRequest } = useNativePlayer();
  const syncPlay = useSyncPlay();
  const { t } = useTranslation();

  // False once the screen that asked for the play is gone.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  return useCallback(
    async (req: PlayRequest, options?: PlayMediaOptions): Promise<void> => {
      // A Book, a Season or a folder has no stream: the player would open,
      // get a 400 from the server and leave the user on a dead screen. Say
      // why instead, and leave the shuffle queue and auto-play chain alone.
      if (options?.item && !isPlayableItem(options.item)) {
        Alert.alert(t("player.error"), t("player.unsupported_item_type"));
        return;
      }

      const isLive = isLiveTvItem(options?.item);

      if (syncPlay.enabled) {
        if (req.offline || isLive) {
          Alert.alert(t("syncplay.title"), t("syncplay.online_video_only"));
          return;
        }
        try {
          // Already in the group's queue: start it there and keep the queue.
          // Anything else replaces the queue, as playing does in Jellyfin.
          const queued = options?.queueItemIds?.length
            ? undefined
            : syncPlay.playlist.find((entry) => entry.ItemId === req.itemId);
          if (queued) {
            await syncPlay.requestPlaylistItem(queued.PlaylistItemId);
            return;
          }
          const itemIds = options?.queueItemIds?.length
            ? options.queueItemIds
            : [req.itemId];
          await syncPlay.playItems(
            itemIds,
            Math.max(0, itemIds.indexOf(req.itemId)),
            req.playbackPositionTicks ?? 0,
          );
        } catch {
          Alert.alert(t("syncplay.title"), t("syncplay.errors.request_failed"));
        }
        return;
      }

      // Moved from PlayButton.goToPlayer: a fresh play starts a new "Still
      // watching?" session and cancels any active shuffle queue.
      resetStillWatchingSession();
      if (!options?.preserveShuffleQueue) {
        setShuffleQueue(null);
      }

      // A tuner takes seconds to open a channel. A viewer who went back
      // meanwhile gave up on it, and the player must not open over wherever
      // they went. Live only: the top shelf route replaces itself with Home
      // before it plays a video, which must still open.
      const isCurrent = isLive ? () => mountedRef.current : undefined;
      await presentFromRequest(req, { isCurrent, alertOnFailure: true });
    },
    [setShuffleQueue, presentFromRequest, syncPlay, t],
  );
};
