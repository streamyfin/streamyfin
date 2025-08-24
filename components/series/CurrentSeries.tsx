import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { router } from "expo-router";
import { useAtom } from "jotai";
import type React from "react";
import { useTranslation } from "react-i18next";
import { TouchableOpacity, View, type ViewProps } from "react-native";
import { apiAtom } from "@/providers/JellyfinProvider";
import { getPrimaryImageUrlById } from "@/utils/jellyfin/image/getPrimaryImageUrlById";
import { HorizontalScroll } from "../common/HorrizontalScroll";
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
        data={item ? [item] : []}
        height={247}
        renderItem={(it, _index) => {
          if (!it) return null;
          return (
            <TouchableOpacity
              key={it.Id}
              onPress={() => router.push(`/series/${it.SeriesId}`)}
              className='flex flex-col space-y-2 w-28'
            >
              <Poster
                id={it.Id}
                url={getPrimaryImageUrlById({ api, id: it.ParentId })}
              />
              <Text>{it.SeriesName}</Text>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
};
