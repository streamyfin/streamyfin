import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import React from "react";
import { View } from "react-native";
import { Text } from "@/components/common/Text";
import { useScaledTVTypography } from "@/constants/TVTypography";
import { scaleSize } from "@/utils/scaleSize";

export interface TVItemCardTextProps {
  item: BaseItemDto;
}

export const TVItemCardText: React.FC<TVItemCardTextProps> = ({ item }) => {
  const typography = useScaledTVTypography();

  return (
    <View style={{ marginTop: scaleSize(12) }}>
      <Text
        numberOfLines={1}
        style={{ fontSize: typography.callout, color: "#FFFFFF" }}
      >
        {item.Name}
      </Text>
      <Text
        style={{
          fontSize: typography.callout - 2,
          color: "#9CA3AF",
          marginTop: scaleSize(2),
        }}
      >
        {item.ProductionYear}
      </Text>
    </View>
  );
};
