import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { useSetAtom } from "jotai";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Alert } from "react-native";
import useRouter from "@/hooks/useAppRouter";
import { isNativePlayerPresented } from "@/modules/mpv-player";
import { useNativePlayer } from "@/providers/NativePlayerProvider";
import { useSyncPlay } from "@/providers/SyncPlay";
import { isNativeChromeActive, useSettings } from "@/utils/atoms/settings";
import { shuffleQueueAtom } from "@/utils/atoms/shuffleQueue";
import { logAndCaptureError, writeErrorLog } from "@/utils/log";
import {
  type PlayRequest,
  toDirectPlayerQuery,
} from "@/utils/nativePlayer/playRequest";

interface PlayMediaOptions {
  /** Shuffle sets the queue right before playing — don't clear it. */
  preserveShuffleQueue?: boolean;
  /**
   * Pass when available: lets the chooser route Live TV (Program/TvChannel)
   * straight to the JS route, which owns live-stream lifecycle handling.
   */
  item?: BaseItemDto | null;
  /** Explicit ordered queue, e.g. the complete series shuffle. */
  queueItems?: BaseItemDto[];
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
  const {
    isEnabled: isSyncPlayEnabled,
    controller,
    registerLocalPlaybackRequest,
  } = useSyncPlay();
  const { t } = useTranslation();

  return useCallback(
    async (req: PlayRequest, options?: PlayMediaOptions): Promise<void> => {
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
        !req.offline &&
        !req.syncPlay &&
        !isLiveTv &&
        isSyncPlayEnabled &&
        controller
      ) {
        const clearLocalRequest = registerLocalPlaybackRequest(req);
        try {
          const queueItems = options?.queueItems?.filter((item) => !!item.Id);
          const startIndex = queueItems?.findIndex(
            (item) => item.Id === req.itemId,
          );
          if (queueItems && (startIndex === undefined || startIndex < 0)) {
            throw new Error(
              "SyncPlay requested item is absent from the supplied queue",
            );
          }
          await controller.play({
            ids: queueItems?.flatMap((item) => (item.Id ? [item.Id] : [])) ?? [
              req.itemId,
            ],
            items: queueItems ?? (options?.item ? [options.item] : undefined),
            startIndex,
            exactQueue: !!queueItems,
            startPositionTicks: req.playbackPositionTicks,
          });
        } catch (error) {
          clearLocalRequest();
          logAndCaptureError("SyncPlay play request failed", error);
          Alert.alert(t("player.client_error"), t("syncplay.failed_to_start"));
        }
        return;
      }
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
      isSyncPlayEnabled,
      controller,
      registerLocalPlaybackRequest,
      t,
    ],
  );
};
