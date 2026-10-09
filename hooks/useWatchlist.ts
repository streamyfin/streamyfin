import {
  type BaseItemDto,
  ItemFilter,
} from "@jellyfin/sdk/lib/generated-client";
import { getUserLibraryApi } from "@jellyfin/sdk/lib/utils/api";
import {
  type InvalidateQueryFilters,
  useQueryClient,
} from "@tanstack/react-query";
import { atom, useAtomValue, useSetAtom } from "jotai";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useOfflineMode } from "@/providers/OfflineModeProvider";
import { useSettings } from "@/utils/atoms/settings";
import { writeToLog } from "@/utils/log";
import { patchCachedItemUserData } from "@/utils/patchCachedItem";
import { removeWatchedFromWatchlist } from "@/utils/watchlistPrune";
import {
  type ToggleStateAtom,
  toggleStateKey,
  useUserDataToggle,
} from "./useUserDataToggle";

// Shared watchlist (Likes) status across all components, keyed by user and item.
const watchlistAtom: ToggleStateAtom = atom<Record<string, boolean>>({});

const LIKES_FILTERS: readonly string[] = [
  ItemFilter.Likes,
  ItemFilter.IsFavoriteOrLikes,
];

/**
 * What a watchlist change makes stale beyond the item's own query: the home
 * rows, the see-all grid, and the library grids that filter by Likes (the
 * "Watchlist" filter). Those carry their server filter list in the query key,
 * so library grids a watchlist change cannot affect are left alone.
 */
const INVALIDATE: InvalidateQueryFilters[] = [
  { queryKey: ["home", "watchlist"] },
  { queryKey: ["favorites", "see-all"] },
  {
    predicate: ({ queryKey }) =>
      queryKey[0] === "library-items" &&
      queryKey.some(
        (part) =>
          Array.isArray(part) &&
          part.some((filter) => LIKES_FILTERS.includes(filter)),
      ),
  },
];

/**
 * KefinTweaks watchlist is backed by Jellyfin's native "Likes" rating.
 * Toggling watchlist membership toggles UserData.Likes on the item.
 *
 * Pass `enabled: false` where the toggle is not offered (KefinTweaks off,
 * offline): every card mounts one, and a passive one writes nothing shared.
 */
export const useWatchlist = (
  item: BaseItemDto,
  { enabled = true }: { enabled?: boolean } = {},
) => {
  const { t } = useTranslation();
  const { value, toggle, isPending, mutation } = useUserDataToggle({
    item,
    field: "Likes",
    stateAtom: watchlistAtom,
    enabled,
    invalidate: INVALIDATE,
    errorMessage: t("watchlists.update_failed"),
    send: (api, userId, itemId, next) =>
      getUserLibraryApi(api).updateUserItemRating({
        itemId,
        userId,
        likes: next,
      }),
  });

  return {
    isWatchlisted: value,
    toggleWatchlist: toggle,
    isPending,
    watchlistMutation: mutation,
  };
};

/**
 * Returns a callback that takes finished items off the KefinTweaks watchlist:
 * pass the ids of items just marked played or just stopped playing. A no-op
 * unless KefinTweaks is on and the server is reachable. Housekeeping, so it
 * never throws: a failure is logged and the item simply stays watchlisted.
 */
export const usePruneWatchedFromWatchlist = () => {
  const queryClient = useQueryClient();
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const setWatchlist = useSetAtom(watchlistAtom);
  const { settings } = useSettings();
  const isOffline = useOfflineMode();
  const { isConnected } = useNetworkStatus();
  // Offline the lookups could only fail, and log a warning on every finish.
  const enabled =
    (settings?.useKefinTweaks ?? false) && !isOffline && isConnected;

  return useCallback(
    async (itemIds: string[]) => {
      const userId = user?.Id;
      if (!enabled || !api || !userId || itemIds.length === 0) return;

      try {
        const { removed, failed } = await removeWatchedFromWatchlist(
          api,
          userId,
          itemIds,
        );
        if (failed.length > 0) {
          writeToLog(
            "WARN",
            "Some watched items could not be removed from the watchlist",
            failed.join(", "),
          );
        }
        if (removed.length === 0) return;

        // Mounted toggles read the shared atom first, so flip it here rather
        // than wait for every item query to refetch.
        setWatchlist((prev) => {
          const next = { ...prev };
          for (const id of removed) next[toggleStateKey(userId, id)] = false;
          return next;
        });
        // A toggle mounted later from a cached list would otherwise read the
        // old Likes back and write it over the shared entry.
        for (const id of removed) {
          patchCachedItemUserData(queryClient, id, { Likes: false });
          queryClient.invalidateQueries({ queryKey: ["item", id] });
        }
        for (const filters of INVALIDATE) {
          queryClient.invalidateQueries(filters);
        }
        // Season toggles read their season from the series page's list.
        queryClient.invalidateQueries({ queryKey: ["seasons"] });
      } catch (error) {
        writeToLog(
          "WARN",
          "Removing watched items from the watchlist failed",
          error instanceof Error ? error.message : String(error),
        );
      }
    },
    [enabled, api, user?.Id, setWatchlist, queryClient],
  );
};
