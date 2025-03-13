import React from "react";
import { View } from "react-native";
import { Text } from "./common/Text";
import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { tc } from "@/utils/textTools";

type ItemCardProps = {
  item: BaseItemDto;
};

export const ItemCardText: React.FC<ItemCardProps> = ({ item }) => {
  return (
    <View className="mt-2 flex flex-col">
      {item.Type === "Episode" ? (
        <>
          <Text numberOfLines={1} ellipsizeMode="tail" className="">
            {item.Name}
          </Text>
          <Text numberOfLines={1} className="text-xs opacity-50">
            {`S${item.ParentIndexNumber?.toString()}:E${item.IndexNumber?.toString()}`}
            {" - "}
            {item.SeriesName}
          </Text>
        </>
      ) : (
        <>
          <Text numberOfLines={1} ellipsizeMode="tail">{item.Name}</Text>
          <Text className="text-xs opacity-50">{item.ProductionYear}</Text>
        </>
      )}
    </View>
  );
};
