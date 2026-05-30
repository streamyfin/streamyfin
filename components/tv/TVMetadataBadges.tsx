import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { View } from "react-native";
import { Badge } from "@/components/Badge";
import { Text } from "@/components/common/Text";
import { useScaledTVTypography } from "@/constants/TVTypography";
import { scaleSize } from "@/utils/scaleSize";

export interface TVMetadataBadgesProps {
  year?: number | null;
  duration?: string | null;
  officialRating?: string | null;
  communityRating?: number | null;
}

export const TVMetadataBadges: React.FC<TVMetadataBadgesProps> = React.memo(
  ({ year, duration, officialRating, communityRating }) => {
    const typography = useScaledTVTypography();

    return (
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          flexWrap: "wrap",
          gap: scaleSize(16),
          marginBottom: scaleSize(24),
        }}
      >
        {year != null && (
          <Text style={{ color: "white", fontSize: typography.body }}>
            {year}
          </Text>
        )}
        {duration && (
          <Text style={{ color: "white", fontSize: typography.body }}>
            {duration}
          </Text>
        )}
        {officialRating && <Badge text={officialRating} variant='gray' />}
        {communityRating != null && (
          <Badge
            text={communityRating.toFixed(1)}
            variant='gray'
            iconLeft={<Ionicons name='star' size={16} color='gold' />}
          />
        )}
      </View>
    );
  },
);
