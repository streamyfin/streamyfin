import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Alert } from "react-native";
import useRouter from "@/hooks/useAppRouter";
import {
  type ExternalPlayerOptions,
  useExternalPlayer,
} from "@/hooks/useExternalPlayer";
import { isNativePlayerPresented } from "@/modules/mpv-player";
import { useNativePlayer } from "@/providers/NativePlayerProvider";
import { useSyncPlay } from "@/providers/SyncPlayProvider";
import { apiAtom, userAtom } from "@/utils/atoms/api";
import {
  isExternalPlayerSupported,
  isNativeChromeActive,
  useSettings,
} from "@/utils/atoms/settings";
import { shuffleQueueAtom } from "@/utils/atoms/shuffleQueue";
import { shouldUseExternalPlayer } from "@/utils/externalPlayer";
import { isPlayableItem } from "@/utils/jellyfin/media/isPlayableItem";
import { getUserItemData } from "@/utils/jellyfin/user-library/getUserItemData";
import { writeErrorLog } from "@/utils/log";
import {
  type PlayRequest,
  toDirectPlayerQuery,
} from "@/utils/nativePlayer/playRequest";
import { resetStillWatchingSession } from "@/utils/stillWatching";

/** The ExternalPlayerOptions only apply when the request goes to another app. */
interface PlayMediaOptions extends ExternalPlayerOptions {
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
  /**
   * Another app (true) or Streamyfin (false), as the user picked in the play
   * button's sheet. Unset, settings.externalPlayerMode decides.
   */
  externalPlayer?: boolean;
}

/**
 * Single entry point for starting video playback on mobile and TV. Routes to
 * another player app (settings.externalPlayerMode), the presented
 * native player (isNativeChromeActive) or the JS player route;
 * any native decline (unsupported platform, Live TV, config/present failure)
 * falls through to the route, so a broken native path can never block
 * playback. The engine — selected via settings.videoPlayer — travels inside
 * the presented config and renders in the JS route's VideoPlayerView.
 */
export const usePlayMedia = () => {
  const router = useRouter();
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const { settings } = useSettings();
  const setShuffleQueue = useSetAtom(shuffleQueueAtom);
  const { presentFromRequest } = useNativePlayer();
  const syncPlay = useSyncPlay();
  const playExternally = useExternalPlayer();
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

      // Moved from PlayButton.goToPlayer: a fresh play starts a new "Still
      // watching?" session and cancels any active shuffle queue.
      resetStillWatchingSession();
      if (!options?.preserveShuffleQueue) {
        setShuffleQueue(null);
      }

      const checkExternal = (candidate?: BaseItemDto | null) =>
        isExternalPlayerSupported &&
        shouldUseExternalPlayer(
          settings.externalPlayerMode,
          candidate,
          options?.externalPlayer,
        );

      // An id alone gives the other app no title or resume position, and hides
      // Live TV from the check: fetch the item, as the in-app players do. A
      // download always carries its item. The in-app players fetch their own.
      let item = options?.item;
      if (!item && !req.offline && checkExternal(item)) {
        item = await getUserItemData({
          api,
          userId: user?.Id,
          itemId: req.itemId,
        }).catch((error) => {
          writeErrorLog(
            "Item for the external player could not be fetched",
            error instanceof Error ? error.message : String(error),
          );
          return null;
        });
        // The server did not answer, don't allow a fallback to the local player when external player is requested.
        if (!item) {
          Alert.alert(
            t("player.error"),
            t("player.an_error_occurred_while_playing_the_video"),
          );
          return;
        }
      }

      if (checkExternal(item)) {
        if (await playExternally(req, item, options)) return;
        // Same rule as the native path: a broken handoff must not block playback.
        Alert.alert(
          t("player.error"),
          t("home.settings.external_player.open_failed"),
        );
      }

      const isLiveTv = item?.Type === "Program" || item?.Type === "TvChannel";
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
      api,
      user?.Id,
      settings,
      setShuffleQueue,
      presentFromRequest,
      playExternally,
      syncPlay,
      t,
    ],
  );
};
