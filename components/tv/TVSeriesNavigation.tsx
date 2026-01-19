import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import React from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, View } from "react-native";
import { Text } from "@/components/common/Text";
import { TVTypography } from "@/constants/TVTypography";
import { TVSeriesSeasonCard } from "./TVSeriesSeasonCard";

export interface TVSeriesNavigationProps {
  item: BaseItemDto;
  seriesImageUrl?: string | null;
  seasonImageUrl?: string | null;
  onSeriesPress: () => void;
  onSeasonPress: () => void;
}

export const TVSeriesNavigation: React.FC<TVSeriesNavigationProps> = React.memo(
  ({ item, seriesImageUrl, seasonImageUrl, onSeriesPress, onSeasonPress }) => {
    const { t } = useTranslation();

    // Only show for episodes with a series
    if (item.Type !== "Episode" || !item.SeriesId) {
      return null;
    }

    return (
      <View style={{ marginBottom: 32 }}>
        <Text
          style={{
            fontSize: TVTypography.heading,
            fontWeight: "600",
            color: "#FFFFFF",
            marginBottom: 24,
          }}
        >
          {t("item_card.from_this_series") || "From this Series"}
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginHorizontal: -80, overflow: "visible" }}
          contentContainerStyle={{
            paddingHorizontal: 80,
            paddingVertical: 12,
            gap: 24,
          }}
        >
          {/* Series card */}
          <TVSeriesSeasonCard
            title={item.SeriesName || "Series"}
            subtitle={t("item_card.view_series") || "View Series"}
            imageUrl={seriesImageUrl ?? null}
            onPress={onSeriesPress}
            hasTVPreferredFocus={false}
          />

          {/* Season card */}
          {(item.SeasonId || item.ParentId) && (
            <TVSeriesSeasonCard
              title={item.SeasonName || `Season ${item.ParentIndexNumber}`}
              subtitle={t("item_card.view_season") || "View Season"}
              imageUrl={seasonImageUrl ?? null}
              onPress={onSeasonPress}
            />
          )}
        </ScrollView>
      </View>
    );
  },
);
