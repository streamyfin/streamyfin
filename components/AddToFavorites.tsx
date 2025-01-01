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
}

export const AddToFavorites: React.FC<Props> = ({ item, ...props }) => {
  const queryClient = useQueryClient();
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);

  const isFavorite = useMemo(() => {
    return item.UserData?.IsFavorite;
  }, [item.UserData?.IsFavorite]);

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
      await queryClient.cancelQueries({ queryKey: ["item", item.Id] });
      const previousItem = queryClient.getQueryData<BaseItemDto>([
        "item",
        item.Id,
      ]);
      queryClient.setQueryData<BaseItemDto>(["item", item.Id], (old) => ({
        ...old!,
        UserData: { ...old!.UserData, IsFavorite: true },
      }));
      return { previousItem };
    },
    onError: (err, variables, context) => {
      queryClient.setQueryData(["item", item.Id], context?.previousItem);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["item", item.Id] });
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
      await queryClient.cancelQueries({ queryKey: ["item", item.Id] });
      const previousItem = queryClient.getQueryData<BaseItemDto>([
        "item",
        item.Id,
      ]);
      queryClient.setQueryData<BaseItemDto>(["item", item.Id], (old) => ({
        ...old!,
        UserData: { ...old!.UserData, IsFavorite: false },
      }));
      return { previousItem };
    },
    onError: (err, variables, context) => {
      queryClient.setQueryData(["item", item.Id], context?.previousItem);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["item", item.Id] });
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
