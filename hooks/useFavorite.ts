import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { getUserLibraryApi } from "@jellyfin/sdk/lib/utils/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";

export const useFavorite = (item: BaseItemDto) => {
  const queryClient = useQueryClient();
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const [isFavorite, setIsFavorite] = useState<boolean | undefined>(
    item.UserData?.IsFavorite,
  );

  useEffect(() => {
    setIsFavorite(item.UserData?.IsFavorite);
  }, [item.UserData?.IsFavorite]);

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
      if (!api || !user || !item.Id) return;
      if (nextIsFavorite) {
        await getUserLibraryApi(api).markFavoriteItem({
          userId: user.Id,
          itemId: item.Id,
        });
        return;
      }
      await getUserLibraryApi(api).unmarkFavoriteItem({
        userId: user.Id,
        itemId: item.Id,
      });
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
