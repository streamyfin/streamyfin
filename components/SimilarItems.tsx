import MoviePoster from "@/components/posters/MoviePoster";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getLibraryApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useAtom } from "jotai";
import { useMemo } from "react";
import { ScrollView, TouchableOpacity, View, ViewProps, Platform } from "react-native";
import { Text } from "./common/Text";
import { ItemCardText } from "./ItemCardText";
import { Loader } from "./Loader";
import { HorizontalScroll } from "./common/HorrizontalScroll";
import { TouchableItemRouter } from "./common/TouchableItemRouter";
import { useTranslation } from "react-i18next";
import { TVFocusable } from "./common/TVFocusable";

interface SimilarItemsProps extends ViewProps {
  itemId?: string | null;
}

export const SimilarItems: React.FC<SimilarItemsProps> = ({
  itemId,
  ...props
}) => {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const { t } = useTranslation();

  const { data: similarItems, isLoading } = useQuery<BaseItemDto[]>({
    queryKey: ["similarItems", itemId],
    queryFn: async () => {
      if (!api || !user?.Id || !itemId) return [];
      const response = await getLibraryApi(api).getSimilarItems({
        itemId,
        userId: user.Id,
        limit: 5,
      });

      return response.data.Items || [];
    },
    enabled: !!api && !!user?.Id,
    staleTime: Infinity,
  });

  const movies = useMemo(
    () => similarItems?.filter((i) => i.Type === "Movie") || [],
    [similarItems]
  );

  const renderItem = (item: BaseItemDto, index: number) => {
    const content = (
      <View className="flex flex-col w-28">
        <MoviePoster item={item} />
        <ItemCardText item={item} />
      </View>
    );

    if (Platform.isTV) {
      return (
        <TVFocusable
          key={item.Id}
          hasTVPreferredFocus={index === 0}
          onSelect={() => {
            if (item) {
              const url = `/item/${item.Id}`;
              router.push(url);
            }
          }}
        >
          {content}
        </TVFocusable>
      );
    }

    return (
      <TouchableItemRouter
        key={item.Id || index}
        item={item}
        className="flex flex-col w-28"
      >
        {content}
      </TouchableItemRouter>
    );
  };

  return (
    <View {...props}>
      <Text className="px-4 text-lg font-bold mb-2">{t("item_card.similar_items")}</Text>
      <HorizontalScroll
        data={movies}
        loading={isLoading}
        height={247}
        noItemsText={t("item_card.no_similar_items_found")}
        renderItem={renderItem}
      />
    </View>
  );
};