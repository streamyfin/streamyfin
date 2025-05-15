import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { getUserLibraryApi } from "@jellyfin/sdk/lib/utils/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { useEffect, useMemo, useState } from "react";

export const useFavorite = (item: BaseItemDto) => {
  const queryClient = useQueryClient();
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const type = "item";
  const [isFavorite, setIsFavorite] = useState(item.UserData?.IsFavorite);

  useEffect(() => {
    setIsFavorite(item.UserData?.IsFavorite);
  }, [item.UserData?.IsFavorite]);

  const updateItemInQueries = (newData: Partial<BaseItemDto>) => {
    queryClient.setQueryData<BaseItemDto | undefined>(
      [type, item.Id],
      (old) => {
        if (!old) return old;
        return {
          ...old,
          ...newData,
          UserData: { ...old.UserData, ...newData.UserData },
        };
      },
    );
  };

  const markFavoriteMutation = useMutation({
    mutationFn: async () => {
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
    onError: (err, variables, context) => {
      if (context?.previousItem) {
        queryClient.setQueryData([type, item.Id], context.previousItem);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [type, item.Id] });
      queryClient.invalidateQueries({ queryKey: ["home", "favorites"] });
      setIsFavorite(true);
    },
  });

  const unmarkFavoriteMutation = useMutation({
    mutationFn: async () => {
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
    onError: (err, variables, context) => {
      if (context?.previousItem) {
        queryClient.setQueryData([type, item.Id], context.previousItem);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [type, item.Id] });
      queryClient.invalidateQueries({ queryKey: ["home", "favorites"] });
      setIsFavorite(false);
    },
  });

  const toggleFavorite = () => {
    if (isFavorite) {
      unmarkFavoriteMutation.mutate();
    } else {
      markFavoriteMutation.mutate();
    }
  };

  return {
    isFavorite,
    toggleFavorite,
    markFavoriteMutation,
    unmarkFavoriteMutation,
  };
};
