import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { BlurView } from "expo-blur";
import { useAtomValue } from "jotai";
import React, { useMemo } from "react";
import { Dimensions, View } from "react-native";
import { Badge } from "@/components/Badge";
import { ServerImage } from "@/components/common/ServerImage";
import { Text } from "@/components/common/Text";
import { GenreTags } from "@/components/GenreTags";
import { useScaledTVTypography } from "@/constants/TVTypography";
import { apiAtom } from "@/providers/JellyfinProvider";
import { getLogoImageUrlById } from "@/utils/jellyfin/image/getLogoImageUrlById";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface TVSeriesHeaderProps {
  item: BaseItemDto;
}

export const TVSeriesHeader: React.FC<TVSeriesHeaderProps> = ({ item }) => {
  const typography = useScaledTVTypography();
  const api = useAtomValue(apiAtom);

  const logoUrl = useMemo(() => {
    if (!api || !item) return null;
    return getLogoImageUrlById({ api, item });
  }, [api, item]);

  const yearString = useMemo(() => {
    const startYear = item.StartDate
      ? new Date(item.StartDate).getFullYear()
      : item.ProductionYear;

    const endYear = item.EndDate ? new Date(item.EndDate).getFullYear() : null;

    if (startYear && endYear) {
      if (startYear === endYear) return String(startYear);
      return `${startYear} - ${endYear}`;
    }
    if (startYear) return String(startYear);
    return null;
  }, [item.StartDate, item.EndDate, item.ProductionYear]);

  return (
    <View style={{ flex: 1, justifyContent: "center" }}>
      {/* Logo or Title */}
      {logoUrl ? (
        <ServerImage
          uri={logoUrl}
          style={{
            height: 100,
            width: "80%",
            marginBottom: 24,
          }}
          contentFit='contain'
          contentPosition='left'
        />
      ) : (
        <Text
          style={{
            fontSize: typography.display,
            fontWeight: "bold",
            color: "#FFFFFF",
            marginBottom: 16,
          }}
          numberOfLines={2}
        >
          {item.Name}
        </Text>
      )}

      {/* Metadata badges row */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 20,
        }}
      >
        {yearString && (
          <Text style={{ color: "white", fontSize: typography.body }}>
            {yearString}
          </Text>
        )}
        {item.OfficialRating && (
          <Badge text={item.OfficialRating} variant='gray' />
        )}
        {item.CommunityRating != null && (
          <Badge
            text={item.CommunityRating.toFixed(1)}
            variant='gray'
            iconLeft={<Ionicons name='star' size={16} color='gold' />}
          />
        )}
      </View>

      {/* Genres */}
      {item.Genres && item.Genres.length > 0 && (
        <View style={{ marginBottom: 24 }}>
          <GenreTags genres={item.Genres} />
        </View>
      )}

      {/* Overview */}
      {item.Overview && (
        <BlurView
          intensity={10}
          tint='light'
          style={{
            borderRadius: 8,
            overflow: "hidden",
            maxWidth: SCREEN_WIDTH * 0.45,
            alignSelf: "flex-start",
          }}
        >
          <View
            style={{
              padding: 16,
              backgroundColor: "rgba(0,0,0,0.3)",
            }}
          >
            <Text
              style={{
                fontSize: typography.body,
                color: "#E5E7EB",
                lineHeight: 32,
              }}
              numberOfLines={4}
            >
              {item.Overview}
            </Text>
          </View>
        </BlurView>
      )}
    </View>
  );
};
