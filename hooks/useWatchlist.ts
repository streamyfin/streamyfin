import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { atom, useAtom, useAtomValue, useSetAtom, useStore } from "jotai";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner-native";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";
import { writeToLog } from "@/utils/log";
import { removeWatchedFromWatchlist } from "@/utils/watchlistPrune";

// Shared atom to store watchlist (Likes) status across all components
// Maps itemId -> isWatchlisted
const watchlistAtom = atom<Record<string, boolean>>({});

/**
 * KefinTweaks watchlist is backed by Jellyfin's native "Likes" rating.
 * Toggling watchlist membership toggles UserData.Likes on the item.
 */
export const useWatchlist = (item: BaseItemDto) => {
  const queryClient = useQueryClient();
  const store = useStore();
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const [watchlist, setWatchlist] = useAtom(watchlistAtom);

  const watchlistKey = user?.Id && item.Id ? `${user.Id}:${item.Id}` : "";

  // Get current watchlist status from shared state, falling back to item data
  const isWatchlisted = watchlistKey
    ? (watchlist[watchlistKey] ?? item.UserData?.Likes)
    : item.UserData?.Likes;

  // Update shared state when item data changes
  useEffect(() => {
    if (watchlistKey && item.UserData?.Likes !== undefined) {
      setWatchlist((prev) => ({
        ...prev,
        [watchlistKey]: item.UserData!.Likes!,
      }));
    }
  }, [watchlistKey, item.UserData?.Likes, setWatchlist]);
  // Helper to update watchlist status in shared state
  const setIsWatchlisted = useCallback(
    (value: boolean | null | undefined) => {
      if (watchlistKey && typeof value === "boolean") {
        setWatchlist((prev) => ({ ...prev, [watchlistKey]: value }));
      }
    },
    [watchlistKey, setWatchlist],
  );

  // Use refs to avoid stale closure issues in mutationFn
  const itemRef = useRef(item);
  const apiRef = useRef(api);
  const userRef = useRef(user);

  // Keep refs updated
  useEffect(() => {
    itemRef.current = item;
  }, [item]);

  useEffect(() => {
    apiRef.current = api;
  }, [api]);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const itemQueryKeyPrefix = useMemo(
    () => ["item", item.Id] as const,
    [item.Id],
  );

  const updateItemInQueries = useCallback(
    (newData: Partial<BaseItemDto>) => {
      queryClient.setQueriesData<BaseItemDto | null | undefined>(
        { queryKey: itemQueryKeyPrefix },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            ...newData,
            UserData: { ...old.UserData, ...newData.UserData },
          };
        },
      );
    },
    [itemQueryKeyPrefix, queryClient],
  );

  const watchlistMutation = useMutation({
    mutationFn: async (nextIsWatchlisted: boolean) => {
      const currentApi = apiRef.current;
      const currentUser = userRef.current;
      const currentItem = itemRef.current;

      if (!currentApi || !currentUser?.Id || !currentItem?.Id) {
        throw new Error("Cannot update watchlist: not signed in");
      }

      // Watchlist == Jellyfin "Likes" rating:
      // POST /UserItems/{itemId}/Rating?userId={userId}&likes=true   - add to watchlist
      // POST /UserItems/{itemId}/Rating?userId={userId}&likes=false  - remove from watchlist
      const path = `/UserItems/${currentItem.Id}/Rating`;

      const response = await currentApi.post(
        path,
        {},
        { params: { userId: currentUser.Id, likes: nextIsWatchlisted } },
      );
      return response.data;
    },
    onMutate: async (nextIsWatchlisted: boolean) => {
      await queryClient.cancelQueries({ queryKey: itemQueryKeyPrefix });

      const previousIsWatchlisted = isWatchlisted;
      const previousQueries = queryClient.getQueriesData<BaseItemDto | null>({
        queryKey: itemQueryKeyPrefix,
      });

      setIsWatchlisted(nextIsWatchlisted);
      updateItemInQueries({ UserData: { Likes: nextIsWatchlisted } });

      return {
        previousIsWatchlisted,
        previousQueries,
        userId: userRef.current?.Id,
      };
    },
    onError: (error: Error, _nextIsWatchlisted, context) => {
      // The item queries are not keyed by account, so a request that fails
      // after a logout or user switch must not restore its snapshots into the
      // next account's cache. Read the store, not userRef: the page that sent
      // the request has usually unmounted by then, freezing the ref.
      if (store.get(userAtom)?.Id !== context?.userId) return;

      // Roll back the optimistic Likes flip applied in onMutate.
      if (context?.previousQueries) {
        for (const [queryKey, data] of context.previousQueries) {
          queryClient.setQueryData(queryKey, data);
        }
      }
      setIsWatchlisted(context?.previousIsWatchlisted);
      toast.error(error.message || "Failed to update watchlist");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: itemQueryKeyPrefix });
      queryClient.invalidateQueries({ queryKey: ["home", "watchlist"] });
      // The favorites/watchlist "see all" grid keeps its own infinite query
      // (["favorites", "see-all", ...]); invalidate it so removing an item
      // from within the see-all screen updates the list in place.
      queryClient.invalidateQueries({ queryKey: ["favorites", "see-all"] });
    },
  });

  const toggleWatchlist = useCallback(() => {
    // Ignore taps while a flip is in flight so overlapping requests can't
    // race and leave Jellyfin's Likes value out of sync with the UI.
    if (watchlistMutation.isPending) return;
    watchlistMutation.mutate(!isWatchlisted);
  }, [watchlistMutation, isWatchlisted]);

  return {
    isWatchlisted,
    toggleWatchlist,
    isPending: watchlistMutation.isPending,
    watchlistMutation,
  };
};

/**
 * Returns a callback that takes finished items off the KefinTweaks watchlist:
 * pass the ids of items just marked played or just stopped playing. A no-op
 * unless KefinTweaks is on. Housekeeping, so it never throws: a failure is
 * logged and the item simply stays watchlisted.
 */
export const usePruneWatchedFromWatchlist = () => {
  const queryClient = useQueryClient();
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const setWatchlist = useSetAtom(watchlistAtom);
  const { settings } = useSettings();
  const enabled = settings?.useKefinTweaks ?? false;

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
          for (const id of removed) next[`${userId}:${id}`] = false;
          return next;
        });
        for (const id of removed) {
          queryClient.invalidateQueries({ queryKey: ["item", id] });
        }
        queryClient.invalidateQueries({ queryKey: ["home", "watchlist"] });
        queryClient.invalidateQueries({ queryKey: ["favorites", "see-all"] });
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
