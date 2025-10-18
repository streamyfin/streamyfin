import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import type React from "react";
import { useMemo } from "react";
import { View } from "react-native";
import { Text } from "./common/Text";

type ItemCardProps = {
  item: BaseItemDto;
};

export const ItemCardText: React.FC<ItemCardProps> = ({ item }) => {
  const createCardText = (
    title: string | number | null | undefined,
    subtitle: string | number | null | undefined,
  ) => {
    return (
      <>
        <Text numberOfLines={1} ellipsizeMode='tail'>
          {title}
        </Text>
        <Text numberOfLines={1} className='text-xs opacity-50'>
          {subtitle}
        </Text>
      </>
    );
  };

  const episodeText = useMemo(() => {
    const season = item.ParentIndexNumber?.toString() || "";
    const episode = item.IndexNumber?.toString() || "";

    return createCardText(
      item.Name,
      `S${season}:E${episode} - ${item.SeriesName}`,
    );
  }, [item]);

  const seasonText = useMemo(() => {
    return createCardText(item.SeriesName, item.Name);
  }, [item]);

  const otherText = useMemo(() => {
    return createCardText(item.Name, item.ProductionYear);
  }, [item]);

  const text = useMemo(() => {
    switch (item.Type) {
      case "Episode":
        return episodeText;
      case "Season":
        return seasonText;
      default:
        return otherText;
    }
  }, [episodeText, otherText]);

  return <View className='mt-2 flex flex-col'>{text}</View>;
};
