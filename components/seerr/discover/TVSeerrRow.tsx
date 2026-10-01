import type React from "react";
import { FlatList, View } from "react-native";
import { Text } from "@/components/common/Text";
import {
  SEERR_TV_ROW_GAP,
  SEERR_TV_ROW_PADDING,
  SEERR_TV_ROW_TITLE_GAP,
} from "@/constants/Seerr";
import { useScaledTVSizes } from "@/constants/TVSizes";
import { useScaledTVTypography } from "@/constants/TVTypography";

/** A row of TV Discover: its title and its cards, scrolling sideways. */
export const TVSeerrRow = <T,>({
  title,
  data,
  keyExtractor,
  renderItem,
  onEndReached,
}: {
  title: string;
  data: T[];
  keyExtractor: (item: T) => string;
  renderItem: (item: T, index: number) => React.ReactElement | null;
  onEndReached?: () => void;
}) => {
  const typography = useScaledTVTypography();
  const sizes = useScaledTVSizes();

  return (
    <View style={{ marginBottom: SEERR_TV_ROW_GAP }}>
      <Text
        style={{
          fontSize: typography.heading,
          fontWeight: "bold",
          color: "#FFFFFF",
          marginBottom: SEERR_TV_ROW_TITLE_GAP,
          marginLeft: sizes.padding.horizontal,
        }}
      >
        {title}
      </Text>
      <FlatList
        horizontal
        data={data}
        keyExtractor={keyExtractor}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: sizes.padding.horizontal,
          // Room for a focused card to grow without being cut by the row.
          paddingVertical: SEERR_TV_ROW_PADDING,
          gap: 20,
        }}
        style={{ overflow: "visible" }}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        renderItem={({ item, index }) => renderItem(item, index)}
      />
    </View>
  );
};
