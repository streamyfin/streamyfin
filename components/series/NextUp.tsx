import { getTvShowsApi } from "@jellyfin/sdk/lib/utils/api";
import { FlashList } from "@shopify/flash-list";
import { useQuery } from "@tanstack/react-query";
import { useAtom } from "jotai";
import type React from "react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import ContinueWatchingPoster from "../ContinueWatchingPoster";
import { Text } from "../common/Text";
import { TouchableItemRouter } from "../common/TouchableItemRouter";
import { ItemCardText } from "../ItemCardText";

export const NextUp: React.FC<{ seriesId: string }> = ({ seriesId }) => {
  const [user] = useAtom(userAtom);
  const [api] = useAtom(apiAtom);
  const { t } = useTranslation();

  const { data: items } = useQuery({
    queryKey: ["nextUp", seriesId],
    queryFn: async () => {
      if (!api) return null;
      return (
        await getTvShowsApi(api).getNextUp({
          userId: user?.Id,
          seriesId,
          fields: ["MediaSourceCount"],
          limit: 10,
        })
      ).data.Items;
    },
    enabled: !!api && !!seriesId && !!user?.Id,
    staleTime: 0,
  });

  // Defensive client-side filter: some Jellyfin server versions ignore the
  // `seriesId` query param on /Shows/NextUp and return next-up items across all
  // series (the same content as the home tab's Next Up row). Filter to ensure
  // we only ever show episodes belonging to this series.
  const filteredItems = useMemo(
    () => items?.filter((item) => item.SeriesId === seriesId) ?? [],
    [items, seriesId],
  );

  if (!filteredItems.length) return null;

  return (
    <View>
      <Text className='text-lg font-bold px-4 mb-2'>
        {t("item_card.next_up")}
      </Text>
      <FlashList
        contentContainerStyle={{ paddingLeft: 16 }}
        horizontal
        showsHorizontalScrollIndicator={false}
        data={filteredItems}
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
