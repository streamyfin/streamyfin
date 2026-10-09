import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { useSetAtom } from "jotai";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Alert } from "react-native";
import useRouter from "@/hooks/useAppRouter";
import { isNativePlayerPresented } from "@/modules/mpv-player";
import { useNativePlayer } from "@/providers/NativePlayerProvider";
import { useSyncPlay } from "@/providers/SyncPlayProvider";
import { isNativeChromeActive, useSettings } from "@/utils/atoms/settings";
import { shuffleQueueAtom } from "@/utils/atoms/shuffleQueue";
import { isPlayableItem } from "@/utils/jellyfin/media/isPlayableItem";
import { writeErrorLog } from "@/utils/log";
import {
  type PlayRequest,
  toDirectPlayerQuery,
} from "@/utils/nativePlayer/playRequest";

interface PlayMediaOptions {
  /** Shuffle sets the queue right before playing — don't clear it. */
  preserveShuffleQueue?: boolean;
  /** Complete ordered video queue; the requested item selects its start index. */
  queueItemIds?: string[];
  /**
   * Pass when available: lets the chooser route Live TV (Program/TvChannel)
   * straight to the JS route, which owns live-stream lifecycle handling, and
   * refuse an item that has nothing to play before a player is opened.
   */
  item?: BaseItemDto | null;
}

/**
 * Single entry point for starting video playback on mobile and TV. Routes to
 * the presented native player (isNativeChromeActive) or the JS player route;
 * any native decline (unsupported platform, Live TV, config/present failure)
 * falls through to the route, so a broken native path can never block
 * playback. The engine — selected via settings.videoPlayer — travels inside
 * the presented config and renders in the JS route's VideoPlayerView.
 */
export const usePlayMedia = () => {
  const router = useRouter();
  const { settings, updateSettings } = useSettings();
  const setShuffleQueue = useSetAtom(shuffleQueueAtom);
  const { presentFromRequest } = useNativePlayer();
  const syncPlay = useSyncPlay();
  const { t } = useTranslation();

  return useCallback(
    async (req: PlayRequest, options?: PlayMediaOptions): Promise<void> => {
      // A Book, a Season or a folder has no stream: both players would open,
      // get a 400 from the server and leave the user on a dead screen. Say
      // why instead, and leave the shuffle queue and auto-play chain alone.
      if (options?.item && !isPlayableItem(options.item)) {
        Alert.alert(t("player.error"), t("player.unsupported_item_type"));
        return;
      }

      if (syncPlay.enabled) {
        if (
          req.offline ||
          options?.item?.Type === "Program" ||
          options?.item?.Type === "TvChannel"
        ) {
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

      // Moved from PlayButton.goToPlayer: a fresh play resets the auto-play
      // chain counter and cancels any active shuffle queue.
      if (settings.maxAutoPlayEpisodeCount.value !== -1) {
        updateSettings({ autoPlayEpisodeCount: 0 });
      }
      if (!options?.preserveShuffleQueue) {
        setShuffleQueue(null);
      }

      const isLiveTv =
        options?.item?.Type === "Program" ||
        options?.item?.Type === "TvChannel";
      if (
        isNativeChromeActive(settings) &&
        !isLiveTv &&
        (await presentFromRequest(req))
      ) {
        return;
      }

      // Never stack the JS route under a still-presented native player (a
      // failed in-place swap keeps the old native session on screen). From
      // the user's side this is a Play tap that did nothing, so record it.
      if (isNativePlayerPresented()) {
        writeErrorLog(
          "Play request dropped: native player still presented after failed present",
        );
        return;
      }

      router.push(`/player/direct-player?${toDirectPlayerQuery(req)}`);
    },
    [
      router,
      settings,
      updateSettings,
      setShuffleQueue,
      presentFromRequest,
      syncPlay,
      t,
    ],
  );
};
