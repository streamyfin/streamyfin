import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { router } from "expo-router";
import { useAtom } from "jotai";
import type React from "react";
import { useTranslation } from "react-i18next";
import { TouchableOpacity, View, type ViewProps } from "react-native";
import { POSTER_CAROUSEL_HEIGHT } from "@/constants/Values";
import { apiAtom } from "@/providers/JellyfinProvider";
import { getPrimaryImageUrlById } from "@/utils/jellyfin/image/getPrimaryImageUrlById";
import { HorizontalScroll } from "../common/HorizontalScroll";
import { Text } from "../common/Text";
import Poster from "../posters/Poster";

interface Props extends ViewProps {
  item?: BaseItemDto | null;
}

export const CurrentSeries: React.FC<Props> = ({ item, ...props }) => {
  const [api] = useAtom(apiAtom);
  const { t } = useTranslation();

  return (
    <View {...props}>
      <Text className='text-lg font-bold mb-2 px-4'>
        {t("item_card.series")}
      </Text>
      <HorizontalScroll
        data={[item]}
        height={POSTER_CAROUSEL_HEIGHT}
        renderItem={(item, _index) => (
          <TouchableOpacity
            key={item?.Id}
            onPress={() =>
              item?.SeriesId && router.push(`/series/${item.SeriesId}`)
            }
            className='flex flex-col space-y-2 w-28'
          >
            <Poster
              id={item?.Id}
              url={getPrimaryImageUrlById({ api, id: item?.ParentId })}
            />
            <Text numberOfLines={1}>{item?.SeriesName}</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
};
