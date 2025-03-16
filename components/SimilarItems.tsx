import MoviePoster from "@/components/posters/MoviePoster";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getLibraryApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useAtom } from "jotai";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  ScrollView,
  TouchableOpacity,
  View,
  type ViewProps,
} from "react-native";
import { ItemCardText } from "./ItemCardText";
import { Loader } from "./Loader";
import { HorizontalScroll } from "./common/HorrizontalScroll";
import { Text } from "./common/Text";
import { TouchableItemRouter } from "./common/TouchableItemRouter";

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
    staleTime: Number.POSITIVE_INFINITY,
  });

  const movies = useMemo(
    () => similarItems?.filter((i) => i.Type === "Movie") || [],
    [similarItems],
  );

  return (
    <View {...props}>
      <Text className='px-4 text-lg font-bold mb-2'>
        {t("item_card.similar_items")}
      </Text>
      <HorizontalScroll
        data={movies}
        loading={isLoading}
        height={247}
        noItemsText={t("item_card.no_similar_items_found")}
        renderItem={(item: BaseItemDto, idx: number) => (
          <TouchableItemRouter
            key={idx}
            item={item}
            className='flex flex-col w-28'
          >
            <View>
              <MoviePoster item={item} />
              <ItemCardText item={item} />
            </View>
          </TouchableItemRouter>
        )}
      />
    </View>
  );
};
