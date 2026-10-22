import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { logAndCaptureError } from "@/utils/log";
import { useHaptic } from "./useHaptic";
import { usePlaybackManager } from "./usePlaybackManager";
import { useInvalidatePlaybackProgressCache } from "./useRevalidatePlaybackProgressCache";
import { usePruneWatchedFromWatchlist } from "./useWatchlist";

/**
 * Marks `items` played or unplayed, optimistically.
 *
 * `watchlistItems` are the items whose watchlist entry marking them played
 * settles, when those are not `items`: with an alternate version selected, an
 * item page marks the version (Jellyfin 12 keeps UserData per version), but
 * the watchlist button rates the page's own item. Jellyfin marks every version
 * played along with the one it is given, so that item reads as finished too.
 */
export const useMarkAsPlayed = (
  items: BaseItemDto[],
  watchlistItems: BaseItemDto[] = items,
) => {
  const queryClient = useQueryClient();
  const lightHapticFeedback = useHaptic("light");
  const { markItemPlayed, markItemUnplayed } = usePlaybackManager();
  const invalidatePlaybackProgressCache = useInvalidatePlaybackProgressCache();
  const pruneWatchedFromWatchlist = usePruneWatchedFromWatchlist();

  const toggle = useCallback(
    async (played: boolean) => {
      lightHapticFeedback();

      const itemIds = items.map((item) => item.Id).filter(Boolean) as string[];

      const previousQueriesByItemId = itemIds.map((itemId) => ({
        itemId,
        queries: queryClient.getQueriesData<BaseItemDto | null>({
          queryKey: ["item", itemId],
        }),
      }));

      for (const itemId of itemIds) {
        queryClient.setQueriesData<BaseItemDto | null | undefined>(
          { queryKey: ["item", itemId] },
          (old) => {
            if (!old) return old;
            return {
              ...old,
              UserData: {
                ...old.UserData,
                Played: played,
                PlaybackPositionTicks: 0,
                PlayedPercentage: 0,
              },
            };
          },
        );
      }

      // Process all items
      try {
        await Promise.all(
          items.map((item) => {
            if (!item.Id) return Promise.resolve();
            return played ? markItemPlayed(item.Id) : markItemUnplayed(item.Id);
          }),
        );
        // Watched means done with it: drop it, and any season or show it
        // finished, from the KefinTweaks watchlist.
        if (played) {
          void pruneWatchedFromWatchlist(
            watchlistItems.map((item) => item.Id).filter(Boolean) as string[],
          );
        }
      } catch (error) {
        // The optimistic update is rolled back, so without a report this
        // user action fails with zero trace anywhere.
        logAndCaptureError("Marking item played/unplayed failed", error, {
          played,
          itemCount: itemIds.length,
        });
        for (const { queries } of previousQueriesByItemId) {
          for (const [queryKey, data] of queries) {
            queryClient.setQueryData(queryKey, data);
          }
        }
      } finally {
        await invalidatePlaybackProgressCache();
        for (const itemId of itemIds) {
          queryClient.invalidateQueries({ queryKey: ["item", itemId] });
        }
      }
    },
    [
      invalidatePlaybackProgressCache,
      items,
      lightHapticFeedback,
      markItemPlayed,
      markItemUnplayed,
      pruneWatchedFromWatchlist,
      queryClient,
      watchlistItems,
    ],
  );

  return toggle;
};
