import { apiAtom } from "@/providers/JellyfinProvider";
import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { router } from "expo-router";
import { useAtom } from "jotai";
import React from "react";
import { TouchableOpacity, View, ViewProps } from "react-native";
import Poster from "../posters/Poster";
import { HorizontalScroll } from "../common/HorrizontalScroll";
import { Text } from "../common/Text";
import { getPrimaryImageUrlById } from "@/utils/jellyfin/image/getPrimaryImageUrlById";
import { useTranslation } from "react-i18next";

interface Props extends ViewProps {
  item?: BaseItemDto | null;
}

export const CurrentSeries: React.FC<Props> = ({ item, ...props }) => {
  const [api] = useAtom(apiAtom);
  const { t } = useTranslation();

  return (
    <View {...props}>
      <Text className="text-lg font-bold mb-2 px-4">{t("item_card.series")}</Text>
      <HorizontalScroll
        data={[item]}
        height={247}
        renderItem={(item, index) => (
          <TouchableOpacity
            key={item.Id}
            onPress={() => router.push(`/series/${item.SeriesId}`)}
            className="flex flex-col space-y-2 w-28"
          >
            <Poster
              id={item.id}
              url={getPrimaryImageUrlById({ api, id: item.ParentId })}
            />
            <Text>{item.SeriesName}</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
};
