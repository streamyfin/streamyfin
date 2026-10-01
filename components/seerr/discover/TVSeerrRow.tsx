import type React from "react";
import { FlatList, View } from "react-native";
import { Text } from "@/components/common/Text";
import { useScaledTVSizes } from "@/constants/TVSizes";
import { useScaledTVTypography } from "@/constants/TVTypography";

// Room for a focused card to grow without being cut by the row.
const SCALE_PADDING = 20;

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
    <View style={{ marginBottom: 24 }}>
      <Text
        style={{
          fontSize: typography.heading,
          fontWeight: "bold",
          color: "#FFFFFF",
          marginBottom: 16,
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
          paddingVertical: SCALE_PADDING,
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
