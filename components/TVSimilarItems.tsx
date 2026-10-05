import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useSegments } from "expo-router";
import React, { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { View, type ViewProps } from "react-native";
import { Text } from "@/components/common/Text";
import { getItemNavigation } from "@/components/common/TouchableItemRouter";
import { TVHorizontalList } from "@/components/tv/TVHorizontalList";
import { TVPosterCard } from "@/components/tv/TVPosterCard";
import { useScaledTVTypography } from "@/constants/TVTypography";
import useRouter from "@/hooks/useAppRouter";
import { useSimilarItems } from "@/hooks/useSimilarItems";
import { useTVItemActionModal } from "@/hooks/useTVItemActionModal";
import { scaleSize } from "@/utils/scaleSize";

interface TVSimilarItemsProps extends ViewProps {
  item?: Pick<BaseItemDto, "Id" | "Type"> | null;
  /** Disable all cards (e.g., when modal is open) */
  disabled?: boolean;
  /** Horizontal padding of the page, so the row can scroll under it */
  horizontalPadding?: number;
  /** Left inset of the heading, to line it up with the page's other headings */
  titleInset?: number;
}

/**
 * The "Similar items" row of a TV detail page.
 *
 * Named with the TV prefix rather than as `SimilarItems.tv.tsx`: under
 * EXPO_TV=1 Metro would hand that file to every import of the mobile
 * `SimilarItems`, which it does not export.
 *
 * Unlike the mobile row it draws nothing until there is something to show: an
 * empty row is one more stop for the focus engine, and only a movie or a series
 * has similar items at all.
 */
export const TVSimilarItems: React.FC<TVSimilarItemsProps> = ({
  item,
  disabled = false,
  horizontalPadding,
  titleInset = 0,
  ...props
}) => {
  const typography = useScaledTVTypography();
  const { t } = useTranslation();
  const router = useRouter();
  const segments = useSegments();
  const from = (segments as string[])[2] || "(home)";
  const { showItemActions } = useTVItemActionModal();
  const { data: similarItems = [] } = useSimilarItems(item);

  const renderItem = useCallback(
    ({ item: similar }: { item: BaseItemDto }) => (
      <TVPosterCard
        item={similar}
        orientation='vertical'
        disabled={disabled}
        onPress={() => router.push(getItemNavigation(similar, from) as any)}
        onLongPress={() => showItemActions(similar)}
      />
    ),
    [disabled, from, router, showItemActions],
  );

  const keyExtractor = useCallback((similar: BaseItemDto) => similar.Id!, []);

  if (similarItems.length === 0) return null;

  return (
    <View {...props}>
      <Text
        style={{
          fontSize: typography.heading,
          fontWeight: "600",
          color: "#FFFFFF",
          marginBottom: scaleSize(24),
          marginLeft: titleInset,
        }}
      >
        {t("item_card.similar_items")}
      </Text>

      <TVHorizontalList
        data={similarItems}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        horizontalPadding={horizontalPadding}
      />
    </View>
  );
};
