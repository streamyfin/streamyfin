import { apiAtom } from "@/providers/JellyfinProvider";
import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { router } from "expo-router";
import { useAtom } from "jotai";
import React from "react";
import { TouchableOpacity, View, ViewProps, Platform } from "react-native";
import Poster from "../posters/Poster";
import { HorizontalScroll } from "../common/HorrizontalScroll";
import { Text } from "../common/Text";
import { getPrimaryImageUrlById } from "@/utils/jellyfin/image/getPrimaryImageUrlById";
import { useTranslation } from "react-i18next";
import { TVFocusable } from "../common/TVFocusable";

interface Props extends ViewProps {
  item?: BaseItemDto | null;
}

export const CurrentSeries: React.FC<Props> = ({ item, ...props }) => {
  const [api] = useAtom(apiAtom);
  const { t } = useTranslation();

  const handleSeriesSelect = (seriesItem: BaseItemDto) => {
    if (seriesItem.SeriesId) {
      router.push(`/series/${seriesItem.SeriesId}`);
    }
  };

  const renderSeriesItem = (seriesItem: BaseItemDto, index: number) => {
    const content = (
      <View className="flex flex-col space-y-2 w-28">
        <Poster
          id={seriesItem.id}
          url={getPrimaryImageUrlById({ api, id: seriesItem.ParentId })}
        />
        <Text>{seriesItem.SeriesName}</Text>
      </View>
    );

    if (Platform.isTV) {
      return (
        <TVFocusable
          key={seriesItem.Id}
          hasTVPreferredFocus={true}
          onSelect={() => handleSeriesSelect(seriesItem)}
        >
          {content}
        </TVFocusable>
      );
    }

    return (
      <TouchableOpacity
        key={seriesItem.Id}
        onPress={() => handleSeriesSelect(seriesItem)}
      >
        {content}
      </TouchableOpacity>
    );
  };

  return (
    <View {...props}>
      <Text className="text-lg font-bold mb-2 px-4">{t("item_card.series")}</Text>
      <HorizontalScroll
        data={item ? [item] : []}
        height={247}
        renderItem={renderSeriesItem}
      />
    </View>
  );
};