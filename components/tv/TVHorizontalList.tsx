import React, { useCallback } from "react";
import { FlatList, ScrollView, View } from "react-native";
import { Text } from "@/components/common/Text";
import { useScaledTVSizes, useTVDesignTokens } from "@/constants/TVSizes";
import { useScaledTVTypography } from "@/constants/TVTypography";

interface TVHorizontalListProps<T> {
  /** Data items to render */
  data: T[];
  /** Unique key extractor */
  keyExtractor: (item: T, index: number) => string;
  /** Render function for each item */
  renderItem: (info: { item: T; index: number }) => React.ReactElement | null;
  /** Optional section title */
  title?: string;
  /** Text to show when data array is empty */
  emptyText?: string;
  /** Whether to use FlatList (for large/infinite lists) or ScrollView (for small lists) */
  useFlatList?: boolean;
  /** Called when end is reached (only for FlatList) */
  onEndReached?: () => void;
  /** Ref for the scroll view */
  scrollViewRef?: React.RefObject<ScrollView | FlatList<T> | null>;
  /** Footer component (only for FlatList) */
  ListFooterComponent?: React.ReactElement | null;
  /** Whether this is the first section (for initial focus) */
  isFirstSection?: boolean;
  /** Loading state */
  isLoading?: boolean;
  /** Skeleton item count when loading */
  skeletonCount?: number;
  /** Skeleton render function */
  renderSkeleton?: () => React.ReactElement;
  /**
   * Custom horizontal padding (overrides default sizes.padding.scale).
   * Use this when the list needs to extend beyond its parent's padding.
   * The list will use negative margin to extend beyond the parent,
   * then add this padding inside to align content properly.
   */
  horizontalPadding?: number;
}

/**
 * TVHorizontalList - A unified horizontal list component for TV.
 *
 * Provides consistent spacing and layout for horizontal lists:
 * - Uses `sizes.gaps.item` (24px default) for gap between items
 * - Uses `sizes.padding.scale` (20px default) for padding to accommodate focus scale
 * - Supports both ScrollView (small lists) and FlatList (large/infinite lists)
 */
export function TVHorizontalList<T>({
  data,
  keyExtractor,
  renderItem,
  title,
  emptyText,
  useFlatList = false,
  onEndReached,
  scrollViewRef,
  ListFooterComponent,
  isLoading = false,
  skeletonCount = 5,
  renderSkeleton,
  horizontalPadding,
}: TVHorizontalListProps<T>) {
  const sizes = useScaledTVSizes();
  const typography = useScaledTVTypography();
  const tv = useTVDesignTokens();

  // Use custom horizontal padding if provided, otherwise use default scale padding
  const effectiveHorizontalPadding = horizontalPadding ?? sizes.padding.scale;
  // Apply negative margin when using custom padding to extend beyond parent
  const marginHorizontal = horizontalPadding ? -horizontalPadding : 0;

  // Wrap renderItem to add consistent gap
  const renderItemWithGap = useCallback(
    ({ item, index }: { item: T; index: number }) => {
      const isLast = index === data.length - 1;
      return (
        <View style={{ marginRight: isLast ? 0 : sizes.gaps.item }}>
          {renderItem({ item, index })}
        </View>
      );
    },
    [data.length, renderItem, sizes.gaps.item],
  );

  // Empty state
  if (!isLoading && data.length === 0 && emptyText) {
    return (
      <View style={{ overflow: "visible" }}>
        {title && (
          <Text
            style={{
              fontSize: typography.heading,
              fontWeight: "700",
              color: "#FFFFFF",
              marginBottom: tv.spacing.lg,
              marginLeft: sizes.padding.scale,
              letterSpacing: 0.5,
            }}
          >
            {title}
          </Text>
        )}
        <Text
          style={{
            color: "#737373",
            fontSize: typography.callout,
            marginLeft: sizes.padding.scale,
          }}
        >
          {emptyText}
        </Text>
      </View>
    );
  }

  // Loading state
  if (isLoading && renderSkeleton) {
    return (
      <View style={{ overflow: "visible" }}>
        {title && (
          <Text
            style={{
              fontSize: typography.heading,
              fontWeight: "700",
              color: "#FFFFFF",
              marginBottom: tv.spacing.lg,
              marginLeft: sizes.padding.scale,
              letterSpacing: 0.5,
            }}
          >
            {title}
          </Text>
        )}
        <View
          style={{
            flexDirection: "row",
            gap: sizes.gaps.item,
            paddingHorizontal: sizes.padding.scale,
            paddingVertical: sizes.padding.scale,
          }}
        >
          {Array.from({ length: skeletonCount }).map((_, i) => (
            <View key={i}>{renderSkeleton()}</View>
          ))}
        </View>
      </View>
    );
  }

  const contentContainerStyle = {
    paddingHorizontal: effectiveHorizontalPadding,
    paddingVertical: sizes.padding.scale,
  };

  const listStyle = {
    overflow: "visible" as const,
    marginHorizontal,
  };

  return (
    <View style={{ overflow: "visible" }}>
      {title && (
        <Text
          style={{
            fontSize: typography.heading,
            fontWeight: "700",
            color: "#FFFFFF",
            marginBottom: tv.spacing.lg,
            marginLeft: sizes.padding.scale,
            letterSpacing: 0.5,
          }}
        >
          {title}
        </Text>
      )}

      {useFlatList ? (
        <FlatList
          ref={scrollViewRef as React.RefObject<FlatList<T>>}
          horizontal
          data={data}
          keyExtractor={keyExtractor}
          renderItem={renderItemWithGap}
          showsHorizontalScrollIndicator={false}
          removeClippedSubviews={false}
          style={listStyle}
          contentContainerStyle={contentContainerStyle}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.5}
          initialNumToRender={5}
          maxToRenderPerBatch={3}
          windowSize={5}
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
          ListFooterComponent={ListFooterComponent}
        />
      ) : (
        <ScrollView
          ref={scrollViewRef as React.RefObject<ScrollView>}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={listStyle}
          contentContainerStyle={contentContainerStyle}
        >
          {data.map((item, index) => (
            <View
              key={keyExtractor(item, index)}
              style={{
                marginRight: index === data.length - 1 ? 0 : sizes.gaps.item,
              }}
            >
              {renderItem({ item, index })}
            </View>
          ))}
          {ListFooterComponent}
        </ScrollView>
      )}
    </View>
  );
}
