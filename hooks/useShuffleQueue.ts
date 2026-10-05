import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useSetAtom } from "jotai";
import { useCallback, useRef } from "react";
import { usePlayMedia } from "@/hooks/usePlayMedia";
import { useSettings } from "@/utils/atoms/settings";
import { shuffleQueueAtom } from "@/utils/atoms/shuffleQueue";
import {
  getAdjacentStartTicks,
  getDefaultPlaySettings,
} from "@/utils/jellyfin/getDefaultPlaySettings";
import { shuffle } from "@/utils/shuffle";

interface StartQueueOptions {
  isOffline?: boolean;
}

/**
 * Shared, platform-agnostic control for the play queue.
 *
 * `startQueue` stores the items in the order given and immediately starts
 * playing the first entry. Once the queue is set, `usePlaybackManager` walks
 * it for next/previous instead of the sequential adjacent-episode order.
 * `startShuffle` does the same in a random order.
 *
 * `clearShuffleQueue` tears the queue down; it is called from the normal
 * (non-queue) play paths so a stale queue can't hijack a later playback.
 */
export const useShuffleQueue = () => {
  const playMedia = usePlayMedia();
  const { settings } = useSettings();
  const setShuffleQueue = useSetAtom(shuffleQueueAtom);
  // usePlayMedia hands out a new function on every render, and these
  // callbacks end up in header options set from an effect: reading the latest
  // through a ref keeps them stable, so the header is not rebuilt per render.
  const latest = useRef({ playMedia, settings });
  latest.current = { playMedia, settings };

  const clearShuffleQueue = useCallback(() => {
    setShuffleQueue(null);
  }, [setShuffleQueue]);

  /** Returns false when nothing in `candidates` can be played. */
  const startQueue = useCallback(
    (candidates: BaseItemDto[], options: StartQueueOptions = {}): boolean => {
      // Skip "Virtual"/missing episode placeholders — they have no media file.
      const items = candidates.filter((e) => e.LocationType !== "Virtual");
      if (items.length === 0) return false;

      setShuffleQueue({ items });

      const { playMedia, settings } = latest.current;
      const first = items[0];
      const { mediaSource, audioIndex, subtitleIndex, bitrate } =
        getDefaultPlaySettings(first, settings);

      // The queue was just set — the chooser must not clear it.
      void playMedia(
        {
          itemId: first.Id ?? "",
          audioIndex,
          subtitleIndex,
          mediaSourceId: mediaSource?.Id ?? undefined,
          bitrateValue: bitrate?.value,
          offline: options.isOffline ?? false,
          playbackPositionTicks:
            getAdjacentStartTicks(first, mediaSource, !!options.isOffline) ?? 0,
        },
        { preserveShuffleQueue: true, item: first },
      );
      return true;
    },
    [setShuffleQueue],
  );

  const startShuffle = useCallback(
    (episodes: BaseItemDto[], options: StartQueueOptions = {}) =>
      startQueue(shuffle(episodes), options),
    [startQueue],
  );

  return { startQueue, startShuffle, clearShuffleQueue };
};
