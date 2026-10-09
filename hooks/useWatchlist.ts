import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { getUserLibraryApi } from "@jellyfin/sdk/lib/utils/api";
import { useQueryClient } from "@tanstack/react-query";
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

const INVALIDATE = [
  ["home", "watchlist"],
  // The favorites/watchlist "see all" grid keeps its own infinite query;
  // refetch it so removing an item from within that screen updates the list.
  ["favorites", "see-all"],
];

/**
 * KefinTweaks watchlist is backed by Jellyfin's native "Likes" rating.
 * Toggling watchlist membership toggles UserData.Likes on the item.
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
 * Returns a callback that takes finished items off the KefinTweaks watchlist.
 * Pass the items as they were BEFORE they were marked played or stopped
 * playing: only those not yet played can have just been finished, so an item
 * already played (back on the watchlist for a rewatch) stays on it.
 *
 * A no-op unless KefinTweaks is on and the server is reachable. Housekeeping,
 * so it never throws: a failure is logged and the item simply stays
 * watchlisted.
 */
export const usePruneWatchedFromWatchlist = () => {
  const queryClient = useQueryClient();
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const setWatchlist = useSetAtom(watchlistAtom);
  const { settings } = useSettings();
  const isOffline = useOfflineMode();
  const { isConnected } = useNetworkStatus();
  const enabled =
    (settings?.useKefinTweaks ?? false) && !isOffline && isConnected;

  return useCallback(
    async (itemsBefore: BaseItemDto[]) => {
      const userId = user?.Id;
      if (!enabled || !api || !userId) return;

      const itemIds = itemsBefore
        .filter((item) => item.UserData?.Played !== true)
        .map((item) => item.Id)
        .filter((id): id is string => !!id);
      if (itemIds.length === 0) return;

      const { removed, failures } = await removeWatchedFromWatchlist(
        api,
        userId,
        itemIds,
      );

      if (failures.length > 0) {
        writeToLog(
          "WARN",
          "Removing watched items from the watchlist failed",
          failures
            .map((error) =>
              error instanceof Error ? error.message : String(error),
            )
            .join("; "),
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
      for (const id of removed) {
        patchCachedItemUserData(queryClient, id, { Likes: false });
        queryClient.invalidateQueries({ queryKey: ["item", id] });
      }
      for (const queryKey of INVALIDATE) {
        queryClient.invalidateQueries({ queryKey });
      }
    },
    [enabled, api, user?.Id, setWatchlist, queryClient],
  );
};
