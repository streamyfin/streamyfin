import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import React from "react";
import { View } from "react-native";
import { Text } from "@/components/common/Text";
import { TVTypography } from "@/constants/TVTypography";

export interface TVItemCardTextProps {
  item: BaseItemDto;
}

export const TVItemCardText: React.FC<TVItemCardTextProps> = ({ item }) => (
  <View style={{ marginTop: 12 }}>
    <Text
      numberOfLines={1}
      style={{ fontSize: TVTypography.callout, color: "#FFFFFF" }}
    >
      {item.Name}
    </Text>
    <Text
      style={{
        fontSize: TVTypography.callout - 2,
        color: "#9CA3AF",
        marginTop: 2,
      }}
    >
      {item.ProductionYear}
    </Text>
  </View>
);
