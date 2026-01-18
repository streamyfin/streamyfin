import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { View } from "react-native";
import { Badge } from "@/components/Badge";
import { Text } from "@/components/common/Text";

export interface TVMetadataBadgesProps {
  year?: number | null;
  duration?: string | null;
  officialRating?: string | null;
  communityRating?: number | null;
}

export const TVMetadataBadges: React.FC<TVMetadataBadgesProps> = React.memo(
  ({ year, duration, officialRating, communityRating }) => {
    return (
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 20,
        }}
      >
        {year != null && (
          <Text style={{ color: "#9CA3AF", fontSize: 18 }}>{year}</Text>
        )}
        {duration && (
          <Text style={{ color: "#9CA3AF", fontSize: 18 }}>{duration}</Text>
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
