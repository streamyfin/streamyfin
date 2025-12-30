import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { getUserLibraryApi } from "@jellyfin/sdk/lib/utils/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { useEffect, useState } from "react";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { updateLocalUserData } from "@/providers/OfflineLibrary/localUserData";
import { addMutation } from "@/providers/OfflineLibrary/mutationQueue";
import { useOfflineLibrary } from "@/providers/OfflineLibrary/OfflineLibraryProvider";

export const useFavorite = (item: BaseItemDto) => {
  const queryClient = useQueryClient();
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const { offlineMode, isItemAvailable } = useOfflineLibrary();
  const type = "item";

  const [isFavorite, setIsFavorite] = useState(
    item.UserData?.IsFavorite ?? false,
  );

  // Subscribe to cache changes for this specific item
  // This ensures all instances stay in sync when any instance updates
  useEffect(() => {
    if (!item.Id) return;

    // Initial sync with cache
    const cachedItem = queryClient.getQueryData<BaseItemDto>([type, item.Id]);
    if (cachedItem?.UserData?.IsFavorite !== undefined) {
      setIsFavorite(cachedItem.UserData.IsFavorite);
    }

    // Subscribe to future cache updates
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (
        event?.type === "updated" &&
        event?.query.queryKey[0] === type &&
        event?.query.queryKey[1] === item.Id
      ) {
        const data = event.query.state.data as BaseItemDto | undefined;
        if (data?.UserData?.IsFavorite !== undefined) {
          setIsFavorite(data.UserData.IsFavorite);
        }
      }
    });

    return unsubscribe;
  }, [item.Id, queryClient]);

  const updateItemInQueries = (newData: Partial<BaseItemDto>) => {
    queryClient.setQueryData<BaseItemDto | undefined>(
      [type, item.Id],
      (old) => {
        // If no cached data exists, create it from the current item
        const base = old || item;
        return {
          ...base,
          ...newData,
          UserData: { ...base.UserData, ...newData.UserData },
        };
      },
    );
  };

  const markFavoriteMutation = useMutation({
    mutationFn: async () => {
      // If offline and item is downloaded, queue mutation instead of API call
      if (offlineMode && item.Id && isItemAvailable(item.Id)) {
        console.log(
          `[useFavorite] Offline mode - queueing FAVORITE for ${item.Id}`,
        );
        updateLocalUserData(item.Id, { IsFavorite: true });
        addMutation("FAVORITE", item.Id, {});
        return; // Skip API call
      }

      // Online mode - make API call
      if (api && user) {
        await getUserLibraryApi(api).markFavoriteItem({
          userId: user.Id,
          itemId: item.Id!,
        });
      }
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: [type, item.Id] });
      const previousItem = queryClient.getQueryData<BaseItemDto>([
        type,
        item.Id,
      ]);
      updateItemInQueries({ UserData: { IsFavorite: true } });

      return { previousItem };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousItem) {
        queryClient.setQueryData([type, item.Id], context.previousItem);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [type, item.Id] });
      queryClient.invalidateQueries({ queryKey: ["home", "favorites"] });
      // Invalidate all track list queries to sync UI across all screens
      if (item.Type === "Audio") {
        queryClient.invalidateQueries({
          predicate: (query) => {
            const key = query.queryKey[0];
            return (
              typeof key === "string" &&
              (key.includes("tracks") ||
                key.includes("album") ||
                key.includes("artist") ||
                key.includes("playlist"))
            );
          },
        });
      }
    },
  });

  const unmarkFavoriteMutation = useMutation({
    mutationFn: async () => {
      // If offline and item is downloaded, queue mutation instead of API call
      if (offlineMode && item.Id && isItemAvailable(item.Id)) {
        console.log(
          `[useFavorite] Offline mode - queueing UNFAVORITE for ${item.Id}`,
        );
        updateLocalUserData(item.Id, { IsFavorite: false });
        addMutation("UNFAVORITE", item.Id, {});
        return; // Skip API call
      }

      // Online mode - make API call
      if (api && user) {
        await getUserLibraryApi(api).unmarkFavoriteItem({
          userId: user.Id,
          itemId: item.Id!,
        });
      }
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: [type, item.Id] });
      const previousItem = queryClient.getQueryData<BaseItemDto>([
        type,
        item.Id,
      ]);
      updateItemInQueries({ UserData: { IsFavorite: false } });

      return { previousItem };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousItem) {
        queryClient.setQueryData([type, item.Id], context.previousItem);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [type, item.Id] });
      queryClient.invalidateQueries({ queryKey: ["home", "favorites"] });
      // Invalidate all track list queries to sync UI across all screens
      if (item.Type === "Audio") {
        queryClient.invalidateQueries({
          predicate: (query) => {
            const key = query.queryKey[0];
            return (
              typeof key === "string" &&
              (key.includes("tracks") ||
                key.includes("album") ||
                key.includes("artist") ||
                key.includes("playlist"))
            );
          },
        });
      }
    },
  });

  const toggleFavorite = () => {
    // Optimistically update local state immediately for instant feedback
    const newValue = !isFavorite;
    setIsFavorite(newValue);

    // Then trigger the mutation
    if (newValue) {
      markFavoriteMutation.mutate();
    } else {
      unmarkFavoriteMutation.mutate();
    }
  };

  return {
    isFavorite,
    toggleFavorite,
    markFavoriteMutation,
    unmarkFavoriteMutation,
  };
};
