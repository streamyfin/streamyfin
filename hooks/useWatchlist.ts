import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { atom, useAtom } from "jotai";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner-native";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";

// Shared atom to store watchlist (Likes) status across all components
// Maps itemId -> isWatchlisted
const watchlistAtom = atom<Record<string, boolean>>({});

/**
 * KefinTweaks watchlist is backed by Jellyfin's native "Likes" rating.
 * Toggling watchlist membership toggles UserData.Likes on the item.
 */
export const useWatchlist = (item: BaseItemDto) => {
  const queryClient = useQueryClient();
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

      return { previousIsWatchlisted, previousQueries };
    },
    onError: (error: Error, _nextIsWatchlisted, context) => {
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
