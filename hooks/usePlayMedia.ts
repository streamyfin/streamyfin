import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { useSetAtom } from "jotai";
import { useCallback } from "react";
import useRouter from "@/hooks/useAppRouter";
import { isNativePlayerPresented } from "@/modules/mpv-player";
import { useNativePlayer } from "@/providers/NativePlayerProvider";
import {
  getActiveVideoPlayer,
  useSettings,
  VideoPlayer,
} from "@/utils/atoms/settings";
import { shuffleQueueAtom } from "@/utils/atoms/shuffleQueue";
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
}

/**
 * Single entry point for starting video playback on mobile and TV. Routes to
 * the presented native player (default on iPhone and tvOS 26+ Apple TVs, with
 * nativeVideoPlayerTV as the TV opt-out — both resolved by
 * getActiveVideoPlayer) or the
 * JS player route; any native decline (unsupported platform, Live TV,
 * config/present failure) falls through to the route, so a broken native
 * path can never block playback.
 */
export const usePlayMedia = () => {
  const router = useRouter();
  const { settings, updateSettings } = useSettings();
  const setShuffleQueue = useSetAtom(shuffleQueueAtom);
  const { presentFromRequest } = useNativePlayer();

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
        getActiveVideoPlayer(settings) === VideoPlayer.Native &&
        !isLiveTv &&
        (await presentFromRequest(req))
      ) {
        return;
      }

      // Never stack the JS route under a still-presented native player (a
      // failed in-place swap keeps the old native session on screen).
      if (isNativePlayerPresented()) return;

      router.push(`/player/direct-player?${toDirectPlayerQuery(req)}`);
    },
    [router, settings, updateSettings, setShuffleQueue, presentFromRequest],
  );
};
