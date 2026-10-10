import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import React, { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Text } from "@/components/common/Text";
import { useScaledTVTypography } from "@/constants/TVTypography";
import { scaleSize } from "@/utils/scaleSize";
import { TVHorizontalList } from "./TVHorizontalList";
import { TVPosterCard } from "./TVPosterCard";

export interface TVCollectionsSectionProps {
  /** The collections the item belongs to. */
  collections: BaseItemDto[];
  onCollectionPress: (collection: BaseItemDto) => void;
  /** Horizontal padding of the page, so the row can scroll edge to edge. */
  horizontalPadding?: number;
}

export const TVCollectionsSection: React.FC<TVCollectionsSectionProps> =
  React.memo(({ collections, onCollectionPress, horizontalPadding }) => {
    const typography = useScaledTVTypography();
    const { t } = useTranslation();

    const renderItem = useCallback(
      ({ item: collection }: { item: BaseItemDto }) => (
        <TVPosterCard
          item={collection}
          onPress={() => onCollectionPress(collection)}
        />
      ),
      [onCollectionPress],
    );

    const keyExtractor = useCallback(
      (collection: BaseItemDto, index: number) =>
        collection.Id ?? String(index),
      [],
    );

    if (collections.length === 0) {
      return null;
    }

    return (
      <View style={{ marginBottom: scaleSize(40) }}>
        <Text
          style={{
            fontSize: typography.heading,
            fontWeight: "600",
            color: "#FFFFFF",
            marginBottom: scaleSize(24),
          }}
        >
          {t("item_card.collections")}
        </Text>
        <TVHorizontalList
          data={collections}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          horizontalPadding={horizontalPadding}
        />
      </View>
    );
  });
