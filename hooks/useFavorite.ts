import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { atom, useAtom } from "jotai";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";

// Shared atom to store favorite status across all components
// Maps itemId -> isFavorite
const favoritesAtom = atom<Record<string, boolean>>({});

export const useFavorite = (item: BaseItemDto) => {
  const queryClient = useQueryClient();
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const [favorites, setFavorites] = useAtom(favoritesAtom);

  const itemId = item.Id ?? "";

  // Get current favorite status from shared state, falling back to item data
  const isFavorite = itemId
    ? (favorites[itemId] ?? item.UserData?.IsFavorite)
    : item.UserData?.IsFavorite;

  // Update shared state when item data changes
  useEffect(() => {
    if (itemId && item.UserData?.IsFavorite !== undefined) {
      setFavorites((prev) => ({
        ...prev,
        [itemId]: item.UserData!.IsFavorite!,
      }));
    }
  }, [itemId, item.UserData?.IsFavorite, setFavorites]);

  // Helper to update favorite status in shared state
  const setIsFavorite = useCallback(
    (value: boolean | undefined) => {
      if (itemId && value !== undefined) {
        setFavorites((prev) => ({ ...prev, [itemId]: value }));
      }
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

  const favoriteMutation = useMutation({
    mutationFn: async (nextIsFavorite: boolean) => {
      const currentApi = apiRef.current;
      const currentUser = userRef.current;
      const currentItem = itemRef.current;

      if (!currentApi || !currentUser?.Id || !currentItem?.Id) {
        return;
      }

      // Use the same endpoint format as the web client:
      // POST /Users/{userId}/FavoriteItems/{itemId} - add favorite
      // DELETE /Users/{userId}/FavoriteItems/{itemId} - remove favorite
      const path = `/Users/${currentUser.Id}/FavoriteItems/${currentItem.Id}`;

      const response = nextIsFavorite
        ? await currentApi.post(path, {}, {})
        : await currentApi.delete(path, {});
      return response.data;
    },
    onMutate: async (nextIsFavorite: boolean) => {
      await queryClient.cancelQueries({ queryKey: itemQueryKeyPrefix });

      const previousIsFavorite = isFavorite;
      const previousQueries = queryClient.getQueriesData<BaseItemDto | null>({
        queryKey: itemQueryKeyPrefix,
      });

      setIsFavorite(nextIsFavorite);
      updateItemInQueries({ UserData: { IsFavorite: nextIsFavorite } });

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
