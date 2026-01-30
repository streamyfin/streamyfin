import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import {
  type QueryFunction,
  type QueryKey,
  useInfiniteQuery,
} from "@tanstack/react-query";
import { useSegments } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

// Extra padding to accommodate scale animation (1.05x) and glow shadow
const SCALE_PADDING = 20;

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
  onLoaded?: () => void;
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
            borderRadius: 24,
            backgroundColor: "rgba(255, 255, 255, 0.08)",
            justifyContent: "center",
            alignItems: "center",
            borderWidth: 1,
            borderColor: "rgba(255, 255, 255, 0.15)",
          }}
        >
          <Ionicons
            name='arrow-forward'
            size={32}
            color='white'
            style={{ marginBottom: 8 }}
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
  onLoaded,
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
  const hasCalledOnLoaded = useRef(false);
  const router = useRouter();
  const { showItemActions } = useTVItemActionModal();
  const segments = useSegments();
  const from = (segments as string[])[2] || "(home)";

  // Track focus within section for item focus/blur callbacks
  const flatListRef = useRef<FlatList<BaseItemDto>>(null);
  const [_focusedCount, setFocusedCount] = useState(0);

  const handleItemFocus = useCallback(
    (item: BaseItemDto) => {
      setFocusedCount((c) => c + 1);
      onItemFocus?.(item);
    },
    [onItemFocus],
  );

  const handleItemBlur = useCallback(() => {
    setFocusedCount((c) => Math.max(0, c - 1));
  }, []);

  // Focus handler for See All card (doesn't need item parameter)
  const handleSeeAllFocus = useCallback(() => {
    setFocusedCount((c) => c + 1);
  }, []);

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    isSuccess,
  } = useInfiniteQuery({
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

  useEffect(() => {
    if (isSuccess && !hasCalledOnLoaded.current && onLoaded) {
      hasCalledOnLoaded.current = true;
      onLoaded();
    }
  }, [isSuccess, onLoaded]);

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
    router.push({
      pathname: "/(auth)/(tabs)/(libraries)/[libraryId]",
      params: {
        libraryId: parentId,
        sortBy: SortByOption.DateCreated,
        sortOrder: SortOrderOption.Descending,
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
            onBlur={handleItemBlur}
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
      handleItemBlur,
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
          marginBottom: 20,
          marginLeft: SCALE_PADDING,
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
            marginLeft: SCALE_PADDING,
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
            paddingHorizontal: SCALE_PADDING,
            paddingVertical: SCALE_PADDING,
          }}
        >
          {[1, 2, 3, 4, 5].map((i) => (
            <View key={i} style={{ width: itemWidth }}>
              <View
                style={{
                  backgroundColor: "#262626",
                  width: itemWidth,
                  aspectRatio: orientation === "horizontal" ? 16 / 9 : 10 / 15,
                  borderRadius: 12,
                  marginBottom: 8,
                }}
              />
              <View
                style={{
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
          initialNumToRender={5}
          maxToRenderPerBatch={3}
          windowSize={5}
          removeClippedSubviews={false}
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
          style={{ overflow: "visible" }}
          contentContainerStyle={{
            paddingVertical: SCALE_PADDING,
            paddingHorizontal: SCALE_PADDING,
          }}
          ListFooterComponent={
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
              }}
            >
              {isFetchingNextPage && (
                <View
                  style={{
                    marginLeft: itemWidth / 2,
                    marginRight: ITEM_GAP,
                    justifyContent: "center",
                    height: orientation === "horizontal" ? 191 : 315,
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
                  onFocus={handleSeeAllFocus}
                  onBlur={handleItemBlur}
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
