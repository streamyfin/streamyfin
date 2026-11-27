import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { useMemo } from "react";
import { View } from "react-native";
import { Text } from "../common/Text";
import { ItemCredits } from "../item/ItemCredits";
import { Ratings } from "../Ratings";

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
    <View className='px-4 py-4'>
      <Text className='text-3xl font-bold' style={{ lineHeight: 38 }}>
        {item?.Name}
      </Text>
      {Boolean(yearString) && (
        // An explicit line height: without one the descenders spill past the
        // text's box, and whatever follows is laid out against the box.
        <Text
          className='opacity-50'
          style={{ lineHeight: 20, marginBottom: 16 }}
        >
          {yearString}
        </Text>
      )}
      <Ratings item={item} className='mb-2' />
      <Text>{item?.Overview}</Text>
      <ItemCredits people={item.People} className='mt-4' />
    </View>
  );
};
