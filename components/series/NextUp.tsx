import { FlashList } from "@shopify/flash-list";
import { useQuery } from "@tanstack/react-query";
import type React from "react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import type { Episode } from "@/models/video/types";
import { useVideoApi } from "@/providers/MediaApiProvider";
import ContinueWatchingPoster from "../ContinueWatchingPoster";
import { Text } from "../common/Text";
import { TouchableItemRouter } from "../common/TouchableItemRouter";
import { ItemCardText } from "../ItemCardText";

/**
 * NextUp component for TV series
 * Uses unified Video API - automatically handles online/offline mode
 */
export const NextUp: React.FC<{ seriesId: string }> = ({ seriesId }) => {
  const videoApi = useVideoApi();
  const { t } = useTranslation();

  const { data: episodes } = useQuery({
    queryKey: ["nextUp", seriesId],
    queryFn: async (): Promise<Episode[]> => {
      if (!videoApi.getNextUp) return [];
      return videoApi.getNextUp(seriesId, 10);
    },
    enabled: !!seriesId,
    staleTime: 0,
  });

  // Convert Episode domain models to BaseItemDto for component compatibility
  const items = useMemo(
    () => episodes?.map((e) => e.jellyfinItem) ?? [],
    [episodes],
  );

  if (!items?.length)
    return (
      <View className='px-4'>
        <Text className='text-lg font-bold mb-2'>{t("item_card.next_up")}</Text>
        <Text className='opacity-50'>{t("item_card.no_items_to_display")}</Text>
      </View>
    );

  return (
    <View>
      <Text className='text-lg font-bold px-4 mb-2'>
        {t("item_card.next_up")}
      </Text>
      <FlashList
        contentContainerStyle={{ paddingLeft: 16 }}
        horizontal
        showsHorizontalScrollIndicator={false}
        data={items}
        renderItem={({ item, index }) => (
          <TouchableItemRouter
            item={item}
            key={index}
            className='flex flex-col w-44'
          >
            <ContinueWatchingPoster item={item} useEpisodePoster />
            <ItemCardText item={item} />
          </TouchableItemRouter>
        )}
      />
    </View>
  );
};
