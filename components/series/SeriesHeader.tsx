import { View } from "react-native";
import { Text } from "../common/Text";
import { Ratings } from "../Ratings";
import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { useMemo } from "react";
import { SeriesActions } from "./SeriesActions";

interface Props {
  item: BaseItemDto;
}

export const SeriesHeader = ({ item }: Props) => {
  const startYear = useMemo(() => {
    if (item?.StartDate) {
      return new Date(item.StartDate)
        .toLocaleDateString("sv-SE", {
          calendar: "gregory",
          year: "numeric",
        })
        .toString()
        .trim();
    }
    return item.ProductionYear?.toString().trim();
  }, [item]);

  const endYear = useMemo(() => {
    if (item.EndDate) {
      return new Date(item.EndDate)
        .toLocaleDateString("sv-SE", {
          calendar: "gregory",
          year: "numeric",
        })
        .toString()
        .trim();
    }
    return "";
  }, [item]);

  const yearString = useMemo(() => {
    if (startYear && endYear) {
      if (startYear === endYear) return startYear;
      return `${startYear} - ${endYear}`;
    }
    if (startYear) {
      return startYear;
    }
    if (endYear) {
      return endYear;
    }
    return "";
  }, [startYear, endYear]);

  return (
    <View className="px-4 py-4">
      <Text className="text-3xl font-bold">{item?.Name}</Text>
      <Text className="">{yearString}</Text>
      <View className="flex flex-row items-center justify-between">
        <Ratings item={item} className="mb-2" />
        <SeriesActions item={item} />
      </View>
      <Text className="">{item?.Overview}</Text>
    </View>
  );
};
