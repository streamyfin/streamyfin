import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { View } from "react-native";
import { Badge } from "@/components/Badge";
import { Text } from "@/components/common/Text";
import { useTVDesignTokens } from "@/constants/TVSizes";
import { useScaledTVTypography } from "@/constants/TVTypography";

export interface TVMetadataBadgesProps {
  year?: number | null;
  duration?: string | null;
  officialRating?: string | null;
  communityRating?: number | null;
}

export const TVMetadataBadges: React.FC<TVMetadataBadgesProps> = React.memo(
  ({ year, duration, officialRating, communityRating }) => {
    const typography = useScaledTVTypography();
    const tv = useTVDesignTokens();

    return (
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          flexWrap: "wrap",
          gap: tv.spacing.md,
          marginBottom: tv.spacing.xl,
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
            iconLeft={
              <Ionicons name='star' size={tv.spacing.md} color='gold' />
            }
          />
        )}
      </View>
    );
  },
);
