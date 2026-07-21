import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useSetAtom } from "jotai";
import { useCallback } from "react";
import useRouter from "@/hooks/useAppRouter";
import { useSettings } from "@/utils/atoms/settings";
import { shuffleQueueAtom } from "@/utils/atoms/shuffleQueue";
import { getDefaultPlaySettings } from "@/utils/jellyfin/getDefaultPlaySettings";
import { shuffle } from "@/utils/shuffle";

interface StartShuffleOptions {
  isOffline?: boolean;
}

/**
 * Shared, platform-agnostic control for the shuffle play queue.
 *
 * `startShuffle` builds a randomized queue for a series and immediately starts
 * playing the first entry. Once the queue is set, `usePlaybackManager` walks it
 * for next/previous instead of the sequential adjacent-episode order.
 *
 * `clearShuffleQueue` tears the queue down; it is called from the normal
 * (non-shuffle) play paths so a stale queue can't hijack a later playback.
 */
export const useShuffleQueue = () => {
  const router = useRouter();
  const { settings } = useSettings();
  const setShuffleQueue = useSetAtom(shuffleQueueAtom);

  const clearShuffleQueue = useCallback(() => {
    setShuffleQueue(null);
  }, [setShuffleQueue]);

  const startShuffle = useCallback(
    (
      seriesId: string,
      episodes: BaseItemDto[],
      options: StartShuffleOptions = {},
    ) => {
      // Skip "Virtual"/missing episode placeholders — they have no media file.
      const playable = episodes.filter((e) => e.LocationType !== "Virtual");
      if (playable.length === 0) return;

      const items = shuffle(playable);
      setShuffleQueue({ seriesId, items });

      const first = items[0];
      const { mediaSource, audioIndex, subtitleIndex, bitrate } =
        getDefaultPlaySettings(first, settings, undefined, {
          applyLanguagePreferences: true,
        });

      const queryParams = new URLSearchParams({
        itemId: first.Id ?? "",
        audioIndex: audioIndex?.toString() ?? "",
        subtitleIndex: subtitleIndex?.toString() ?? "",
        mediaSourceId: mediaSource?.Id ?? "",
        bitrateValue: bitrate?.value?.toString() ?? "",
        playbackPosition:
          first.UserData?.PlaybackPositionTicks?.toString() ?? "0",
        offline: options.isOffline ? "true" : "false",
      });

      router.push(`/player/direct-player?${queryParams.toString()}`);
    },
    [router, settings, setShuffleQueue],
  );

  return { startShuffle, clearShuffleQueue };
};
