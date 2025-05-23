import { ItemCardText } from "@/components/ItemCardText";
import { HorizontalScroll } from "@/components/common/HorrizontalScroll";
import { Text } from "@/components/common/Text";
import { TouchableItemRouter } from "@/components/common/TouchableItemRouter";
import MoviePoster from "@/components/posters/MoviePoster";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { getUserItemData } from "@/utils/jellyfin/user-library/getUserItemData";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getItemsApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { useAtom } from "jotai";
import type React from "react";
import { useTranslation } from "react-i18next";
import { View, type ViewProps } from "react-native";

interface Props extends ViewProps {
  actorId: string;
  currentItem: BaseItemDto;
}

export const MoreMoviesWithActor: React.FC<Props> = ({
  actorId,
  currentItem,
  ...props
}) => {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const { t } = useTranslation();

  const { data: actor } = useQuery({
    queryKey: ["actor", actorId],
    queryFn: async () => {
      if (!api || !user?.Id) return null;
      return await getUserItemData({
        api,
        userId: user.Id,
        itemId: actorId,
      });
    },
    enabled: !!api && !!user?.Id && !!actorId,
  });

  const { data: items, isLoading } = useQuery({
    queryKey: ["actor", "movies", actorId, currentItem.Id],
    queryFn: async () => {
      if (!api || !user?.Id) return [];
      const response = await getItemsApi(api).getItems({
        userId: user.Id,
        personIds: [actorId],
        limit: 20,
        sortOrder: ["Descending"],
        includeItemTypes: ["Movie", "Series"],
        recursive: true,
        fields: ["ParentId", "PrimaryImageAspectRatio"],
        sortBy: ["PremiereDate"],
        collapseBoxSetItems: false,
        excludeItemIds: [currentItem.SeriesId || "", currentItem.Id || ""],
      });

      // Remove duplicates based on item ID
      const uniqueItems =
        response.data.Items?.reduce((acc, current) => {
          const x = acc.find((item) => item.Id === current.Id);
          if (!x) {
            return acc.concat([current]);
          }
          return acc;
        }, [] as BaseItemDto[]) || [];

      return uniqueItems;
    },
    enabled: !!api && !!user?.Id && !!actorId,
  });

  if (items?.length === 0) return null;

  return (
    <View {...props}>
      <Text className='text-lg font-bold mb-2 px-4'>
        {t("item_card.more_with", { name: actor?.Name })}
      </Text>
      <HorizontalScroll
        data={items}
        loading={isLoading}
        height={247}
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
