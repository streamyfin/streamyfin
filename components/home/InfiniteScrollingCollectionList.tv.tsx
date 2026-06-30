import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import {
  type QueryFunction,
  type QueryKey,
  useInfiniteQuery,
} from "@tanstack/react-query";
import { useSegments } from "expo-router";
import { useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  FlatList,
  View,
  type ViewProps,
} from "react-native";
import { Text } from "@/components/common/Text";
import { getItemNavigation } from "@/components/common/TouchableItemRouter";
import { TVFocusablePoster } from "@/components/tv/TVFocusablePoster";
import { TVPosterCard } from "@/components/tv/TVPosterCard";
import { useScaledTVPosterSizes } from "@/constants/TVPosterSizes";
import { useScaledTVSizes } from "@/constants/TVSizes";
import { useScaledTVTypography } from "@/constants/TVTypography";
import useRouter from "@/hooks/useAppRouter";
import { useTVItemActionModal } from "@/hooks/useTVItemActionModal";
import { SortByOption, SortOrderOption } from "@/utils/atoms/filters";
import { scaleSize } from "@/utils/scaleSize";

// Extra padding to accommodate scale animation (1.05x) and glow shadow
const _SCALE_PADDING = scaleSize(20);

interface Props extends ViewProps {
  title?: string | null;
  orientation?: "horizontal" | "vertical";
  disabled?: boolean;
  queryKey: QueryKey;
  queryFn: QueryFunction<BaseItemDto[], QueryKey, number>;
  hideIfEmpty?: boolean;
  pageSize?: number;
  onPressSeeAll?: () => void;
  enabled?: boolean;
  isFirstSection?: boolean;
  onItemFocus?: (item: BaseItemDto) => void;
  parentId?: string;
}

type Typography = ReturnType<typeof useScaledTVTypography>;
type PosterSizes = ReturnType<typeof useScaledTVPosterSizes>;

// TV-specific "See All" card for end of lists
const TVSeeAllCard: React.FC<{
  onPress: () => void;
  orientation: "horizontal" | "vertical";
  disabled?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
  typography: Typography;
  posterSizes: PosterSizes;
}> = ({
  onPress,
  orientation,
  disabled,
  onFocus,
  onBlur,
  typography,
  posterSizes,
}) => {
  const { t } = useTranslation();
  const width =
    orientation === "horizontal" ? posterSizes.episode : posterSizes.poster;
  const aspectRatio = orientation === "horizontal" ? 16 / 9 : 10 / 15;

  return (
    <View style={{ width }}>
      <TVFocusablePoster
        onPress={onPress}
        disabled={disabled}
        onFocus={onFocus}
        onBlur={onBlur}
      >
        <View
          style={{
            width,
            aspectRatio,
            borderRadius: scaleSize(24),
            backgroundColor: "rgba(255, 255, 255, 0.08)",
            justifyContent: "center",
            alignItems: "center",
            borderWidth: 1,
            borderColor: "rgba(255, 255, 255, 0.15)",
          }}
        >
          <Ionicons
            name='arrow-forward'
            size={scaleSize(32)}
            color='white'
            style={{ marginBottom: scaleSize(8) }}
          />
          <Text
            style={{
              fontSize: typography.callout,
              color: "#FFFFFF",
              fontWeight: "600",
            }}
          >
            {t("common.seeAll", { defaultValue: "See all" })}
          </Text>
        </View>
      </TVFocusablePoster>
    </View>
  );
};

export const InfiniteScrollingCollectionList: React.FC<Props> = ({
  title,
  orientation = "vertical",
  disabled = false,
  queryFn,
  queryKey,
  hideIfEmpty = false,
  pageSize = 10,
  enabled = true,
  isFirstSection = false,
  onItemFocus,
  parentId,
  ...props
}) => {
  const typography = useScaledTVTypography();
  const posterSizes = useScaledTVPosterSizes();
  const sizes = useScaledTVSizes();
  const ITEM_GAP = sizes.gaps.item;
  const effectivePageSize = Math.max(1, pageSize);
  const router = useRouter();
  const { showItemActions } = useTVItemActionModal();
  const segments = useSegments();
  const from = (segments as string[])[2] || "(home)";

  const flatListRef = useRef<FlatList<BaseItemDto>>(null);

  // Pass through focus callbacks without tracking internal state
  const handleItemFocus = useCallback(
    (item: BaseItemDto) => {
      onItemFocus?.(item);
    },
    [onItemFocus],
  );

  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } =
    useInfiniteQuery({
      queryKey: queryKey,
      queryFn: ({ pageParam = 0, ...context }) =>
        queryFn({ ...context, queryKey, pageParam }),
      getNextPageParam: (lastPage, allPages) => {
        if (lastPage.length < effectivePageSize) {
          return undefined;
        }
        return allPages.reduce((acc, page) => acc + page.length, 0);
      },
      initialPageParam: 0,
      staleTime: 60 * 1000,
      refetchInterval: 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      enabled,
    });

  const { t } = useTranslation();

  const allItems = useMemo(() => {
    const items = data?.pages.flat() ?? [];
    const seen = new Set<string>();
    const deduped: BaseItemDto[] = [];

    for (const item of items) {
      const id = item.Id;
      if (!id) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      deduped.push(item);
    }

    return deduped;
  }, [data]);

  const itemWidth =
    orientation === "horizontal" ? posterSizes.episode : posterSizes.poster;

  const handleItemPress = useCallback(
    (item: BaseItemDto) => {
      const navigation = getItemNavigation(item, from);
      router.push(navigation as any);
    },
    [from, router],
  );

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleSeeAllPress = useCallback(() => {
    if (!parentId) return;
    // Navigate into the library detail (lives in the libraries tab) sorted by most
    // recently added. The `fromSeeAll` flag tells the detail page to (a) collapse
    // the libraries stack so the native tab can't auto-pop it back to the list, and
    // (b) intercept Back to route to the library list so the user can switch
    // libraries. See app/(auth)/(tabs)/(libraries)/[libraryId].tsx.
    router.push({
      pathname: "/[libraryId]",
      params: {
        libraryId: parentId,
        sortBy: SortByOption.DateCreated,
        sortOrder: SortOrderOption.Descending,
        fromSeeAll: "true",
      },
    } as any);
  }, [router, parentId]);

  const renderItem = useCallback(
    ({ item, index }: { item: BaseItemDto; index: number }) => {
      const isFirstItem = isFirstSection && index === 0;

      return (
        <View style={{ marginRight: ITEM_GAP }}>
          <TVPosterCard
            item={item}
            orientation={orientation}
            onPress={() => handleItemPress(item)}
            onLongPress={() => showItemActions(item)}
            hasTVPreferredFocus={isFirstItem}
            onFocus={() => handleItemFocus(item)}
            width={itemWidth}
          />
        </View>
      );
    },
    [
      orientation,
      isFirstSection,
      itemWidth,
      handleItemPress,
      showItemActions,
      handleItemFocus,
      ITEM_GAP,
    ],
  );

  if (hideIfEmpty === true && allItems.length === 0 && !isLoading) return null;
  if (disabled || !title) return null;

  return (
    <View style={{ overflow: "visible" }} {...props}>
      {/* Section Header */}
      <Text
        style={{
          fontSize: typography.heading,
          fontWeight: "700",
          color: "#FFFFFF",
          marginBottom: scaleSize(20),
          marginLeft: sizes.padding.horizontal,
          letterSpacing: 0.5,
        }}
      >
        {title}
      </Text>

      {isLoading === false && allItems.length === 0 && (
        <Text
          style={{
            color: "#737373",
            fontSize: typography.callout,
            marginLeft: sizes.padding.horizontal,
          }}
        >
          {t("home.no_items")}
        </Text>
      )}

      {isLoading ? (
        <View
          style={{
            flexDirection: "row",
            gap: ITEM_GAP,
            paddingLeft: sizes.padding.horizontal,
            paddingRight: sizes.padding.horizontal,
            paddingVertical: sizes.gaps.small,
          }}
        >
          {[1, 2, 3, 4, 5].map((i) => (
            <View key={i} style={{ width: itemWidth }}>
              <View
                style={{
                  backgroundColor: "#262626",
                  width: itemWidth,
                  aspectRatio: orientation === "horizontal" ? 16 / 9 : 10 / 15,
                  borderRadius: scaleSize(24),
                }}
              />
              <View
                style={{
                  marginTop: scaleSize(12),
                  paddingHorizontal: scaleSize(4),
                  borderRadius: 6,
                  overflow: "hidden",
                  marginBottom: 4,
                  alignSelf: "flex-start",
                }}
              >
                <Text
                  style={{
                    color: "#262626",
                    backgroundColor: "#262626",
                    borderRadius: 6,
                    fontSize: typography.callout,
                  }}
                  numberOfLines={1}
                >
                  Placeholder text here
                </Text>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          horizontal
          data={allItems}
          keyExtractor={(item) => item.Id!}
          renderItem={renderItem}
          showsHorizontalScrollIndicator={false}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.5}
          initialNumToRender={4}
          maxToRenderPerBatch={2}
          windowSize={3}
          removeClippedSubviews={false}
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
          style={{ overflow: "visible" }}
          contentContainerStyle={{
            paddingVertical: sizes.gaps.small,
            paddingLeft: sizes.padding.horizontal,
            paddingRight: sizes.padding.horizontal,
          }}
          // Below is a work around with the contentInset, same in TVHeroCarousel, if okay on apple remove
          // ListHeaderComponent={
          //   <View style={{ width: sizes.padding.horizontal }} />
          // }
          // contentInset={{
          //   left: sizes.padding.horizontal,
          //   right: sizes.padding.horizontal,
          // }}
          // contentOffset={{ x: -sizes.padding.horizontal, y: 0 }}
          // contentContainerStyle={{ paddingVertical: SCALE_PADDING }}
          ListFooterComponent={
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                width: sizes.padding.horizontal,
              }}
            >
              {isFetchingNextPage && (
                <View
                  style={{
                    marginLeft: itemWidth / 2,
                    marginRight: ITEM_GAP,
                    justifyContent: "center",
                    height:
                      orientation === "horizontal"
                        ? scaleSize(191)
                        : scaleSize(315),
                  }}
                >
                  <ActivityIndicator size='small' color='white' />
                </View>
              )}
              {parentId && allItems.length > 0 && (
                <TVSeeAllCard
                  onPress={handleSeeAllPress}
                  orientation={orientation}
                  disabled={disabled}
                  typography={typography}
                  posterSizes={posterSizes}
                />
              )}
            </View>
          }
        />
      )}
    </View>
  );
};
