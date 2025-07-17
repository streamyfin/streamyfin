import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { QueryKey, useQueryClient } from "@tanstack/react-query";
import { useHaptic } from "./useHaptic";
import { usePlaybackManager } from "./usePlaybackManager";
import { useInvalidatePlaybackProgressCache } from "./useRevalidatePlaybackProgressCache";

export const useMarkAsPlayed = (items: BaseItemDto[]) => {
  const queryClient = useQueryClient();
  const lightHapticFeedback = useHaptic("light");
  const { markItemPlayed, markItemUnplayed } = usePlaybackManager();
  const invalidatePlaybackProgressCache = useInvalidatePlaybackProgressCache();
  const invalidateQueries = async () => {
    const queriesToInvalidate: QueryKey[] = [];
    items.forEach((item) => {
      if (!item.Id) return;
      queriesToInvalidate.push(["item", item.Id]);
    });
    await Promise.all(
      queriesToInvalidate.map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    );
  };

  const toggle = async (played: boolean) => {
    lightHapticFeedback();
    // Process all items
    await Promise.all(
      items.map((item) => {
        if (!item.Id) return Promise.resolve();
        return played ? markItemPlayed(item.Id) : markItemUnplayed(item.Id);
      }),
    );
    invalidatePlaybackProgressCache();
    invalidateQueries();
  };

  return toggle;
};
