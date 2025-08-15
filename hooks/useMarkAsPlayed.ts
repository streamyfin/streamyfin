import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useHaptic } from "./useHaptic";
import { usePlaybackManager } from "./usePlaybackManager";
import { useInvalidatePlaybackProgressCache } from "./useRevalidatePlaybackProgressCache";

export const useMarkAsPlayed = (items: BaseItemDto[]) => {
  const lightHapticFeedback = useHaptic("light");
  const { markItemPlayed, markItemUnplayed } = usePlaybackManager();
  const invalidatePlaybackProgressCache = useInvalidatePlaybackProgressCache();

  const toggle = async (played: boolean) => {
    lightHapticFeedback();
    // Process all items
    await Promise.all(
      items.map((item) => {
        if (!item.Id) return Promise.resolve();
        return played ? markItemPlayed(item.Id) : markItemUnplayed(item.Id);
      }),
    );

    await invalidatePlaybackProgressCache();
  };

  return toggle;
};
