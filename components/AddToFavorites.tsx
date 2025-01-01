import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { getUserLibraryApi } from "@jellyfin/sdk/lib/utils/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { useMemo } from "react";
import { TouchableOpacityProps, View, ViewProps } from "react-native";
import { RoundButton } from "./RoundButton";

interface Props extends ViewProps {
  item: BaseItemDto;
  type: "item" | "series";
}

export const AddToFavorites: React.FC<Props> = ({ item, type, ...props }) => {
  const queryClient = useQueryClient();
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);

  const isFavorite = useMemo(() => {
    return item.UserData?.IsFavorite;
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
      }
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
    },
  });

  return (
    <View {...props}>
      <RoundButton
        size="large"
        icon={isFavorite ? "heart" : "heart-outline"}
        fillColor={isFavorite ? "primary" : undefined}
        onPress={() => {
          if (isFavorite) {
            unmarkFavoriteMutation.mutate();
          } else {
            markFavoriteMutation.mutate();
          }
        }}
      />
    </View>
  );
};
