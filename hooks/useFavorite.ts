import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { getUserDataApi } from "@jellyfin/sdk/lib/utils/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { atom, useAtom, useAtomValue, useSetAtom } from "jotai";
import { selectAtom } from "jotai/utils";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";

// Shared atom to store favorite status across all components
// Maps itemId -> isFavorite
const favoritesAtom = atom<Record<string, boolean>>({});

export const useFavorite = (item: BaseItemDto) => {
  const queryClient = useQueryClient();
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const setFavorites = useSetAtom(favoritesAtom);

  const itemId = item.Id ?? "";

  // Subscribes to this item only, so a write for another item, as every
  // mounting row of a list does, doesn't re-render it.
  const sharedIsFavorite = useAtomValue(
    useMemo(
      () => selectAtom(favoritesAtom, (favorites) => favorites[itemId]),
      [itemId],
    ),
  );

  // Get current favorite status from shared state, falling back to item data
  const isFavorite = itemId
    ? (sharedIsFavorite ?? item.UserData?.IsFavorite)
    : item.UserData?.IsFavorite;

  // Update shared state when item data changes
  useEffect(() => {
    const value = item.UserData?.IsFavorite;
    if (itemId && value !== undefined) {
      setFavorites((prev) =>
        prev[itemId] === value ? prev : { ...prev, [itemId]: value },
      );
    }
  }, [itemId, item.UserData?.IsFavorite, setFavorites]);

  // Helper to update favorite status in shared state
  const setIsFavorite = useCallback(
    (value: boolean | undefined) => {
      if (!itemId) return;
      setFavorites((prev) => {
        if (value !== undefined) return { ...prev, [itemId]: value };
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
    },
    [itemId, setFavorites],
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
    (nextIsFavorite: boolean) => {
      queryClient.setQueriesData<BaseItemDto | null | undefined>(
        { queryKey: itemQueryKeyPrefix },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            UserData: {
              Key: "",
              ...old.UserData,
              IsFavorite: nextIsFavorite,
            },
          };
        },
      );
    },
    [itemQueryKeyPrefix, queryClient],
  );

  const favoriteMutation = useMutation({
    mutationFn: async (nextIsFavorite: boolean) => {
      const currentApi = apiRef.current;
      const currentUser = userRef.current;
      const currentItem = itemRef.current;

      if (!currentApi || !currentUser?.Id || !currentItem?.Id) {
        return;
      }

      const userDataApi = getUserDataApi(currentApi);
      const request = { itemId: currentItem.Id, userId: currentUser.Id };
      const response = nextIsFavorite
        ? await userDataApi.markFavoriteItem(request)
        : await userDataApi.unmarkFavoriteItem(request);
      return response.data;
    },
    onMutate: async (nextIsFavorite: boolean) => {
      await queryClient.cancelQueries({ queryKey: itemQueryKeyPrefix });

      const previousIsFavorite = isFavorite;
      const previousQueries = queryClient.getQueriesData<BaseItemDto | null>({
        queryKey: itemQueryKeyPrefix,
      });

      setIsFavorite(nextIsFavorite);
      updateItemInQueries(nextIsFavorite);

      return { previousIsFavorite, previousQueries };
    },
    onError: (_err, _nextIsFavorite, context) => {
      if (context?.previousQueries) {
        for (const [queryKey, data] of context.previousQueries) {
          queryClient.setQueryData(queryKey, data);
        }
      }
      setIsFavorite(context?.previousIsFavorite);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: itemQueryKeyPrefix });
      queryClient.invalidateQueries({ queryKey: ["home", "favorites"] });
      if (
        itemRef.current.Type === "TvChannel" ||
        itemRef.current.Type === "LiveTvChannel"
      ) {
        queryClient.invalidateQueries({ queryKey: ["livetv"] });
      }
    },
  });

  const toggleFavorite = useCallback(() => {
    favoriteMutation.mutate(!isFavorite);
  }, [favoriteMutation, isFavorite]);

  return {
    isFavorite,
    toggleFavorite,
    favoriteMutation,
  };
};
