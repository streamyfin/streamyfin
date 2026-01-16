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
import MoviePoster, {
  TV_POSTER_WIDTH,
} from "@/components/posters/MoviePoster.tv";
import { TVFocusablePoster } from "@/components/tv/TVFocusablePoster";
import { Colors } from "@/constants/Colors";
import useRouter from "@/hooks/useAppRouter";
import ContinueWatchingPoster, {
  TV_LANDSCAPE_WIDTH,
} from "../ContinueWatchingPoster.tv";
import SeriesPoster from "../posters/SeriesPoster.tv";

const ITEM_GAP = 16;
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
}

// TV-specific ItemCardText with larger fonts
const TVItemCardText: React.FC<{ item: BaseItemDto }> = ({ item }) => {
  return (
    <View style={{ marginTop: 12, flexDirection: "column" }}>
      {item.Type === "Episode" ? (
        <>
          <Text numberOfLines={1} style={{ fontSize: 16, color: "#FFFFFF" }}>
            {item.Name}
          </Text>
          <Text
            numberOfLines={1}
            style={{ fontSize: 14, color: "#9CA3AF", marginTop: 2 }}
          >
            {`S${item.ParentIndexNumber?.toString()}:E${item.IndexNumber?.toString()}`}
            {" - "}
            {item.SeriesName}
          </Text>
        </>
      ) : (
        <>
          <Text numberOfLines={1} style={{ fontSize: 16, color: "#FFFFFF" }}>
            {item.Name}
          </Text>
          <Text style={{ fontSize: 14, color: "#9CA3AF", marginTop: 2 }}>
            {item.ProductionYear}
          </Text>
        </>
      )}
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
  ...props
}) => {
  const effectivePageSize = Math.max(1, pageSize);
  const hasCalledOnLoaded = useRef(false);
  const router = useRouter();
  const segments = useSegments();
  const from = (segments as string[])[2] || "(home)";

  // Track focus within section and scroll back to start when leaving
  const flatListRef = useRef<FlatList<BaseItemDto>>(null);
  const [focusedCount, setFocusedCount] = useState(0);
  const prevFocusedCount = useRef(0);

  // When section loses all focus, scroll back to start
  useEffect(() => {
    if (prevFocusedCount.current > 0 && focusedCount === 0) {
      flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
    }
    prevFocusedCount.current = focusedCount;
  }, [focusedCount]);

  const handleItemFocus = useCallback(() => {
    setFocusedCount((c) => c + 1);
  }, []);

  const handleItemBlur = useCallback(() => {
    setFocusedCount((c) => Math.max(0, c - 1));
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
    refetchOnMount: false,
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
    orientation === "horizontal" ? TV_LANDSCAPE_WIDTH : TV_POSTER_WIDTH;

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

  const getItemLayout = useCallback(
    (_data: ArrayLike<BaseItemDto> | null | undefined, index: number) => ({
      length: itemWidth + ITEM_GAP,
      offset: (itemWidth + ITEM_GAP) * index,
      index,
    }),
    [itemWidth],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: BaseItemDto; index: number }) => {
      const isFirstItem = isFirstSection && index === 0;
      const isHorizontal = orientation === "horizontal";

      const renderPoster = () => {
        if (item.Type === "Episode" && isHorizontal) {
          return <ContinueWatchingPoster item={item} />;
        }
        if (item.Type === "Episode" && !isHorizontal) {
          return <SeriesPoster item={item} />;
        }
        if (item.Type === "Movie" && isHorizontal) {
          return <ContinueWatchingPoster item={item} />;
        }
        if (item.Type === "Movie" && !isHorizontal) {
          return <MoviePoster item={item} />;
        }
        if (item.Type === "Series" && !isHorizontal) {
          return <SeriesPoster item={item} />;
        }
        if (item.Type === "Series" && isHorizontal) {
          return <ContinueWatchingPoster item={item} />;
        }
        if (item.Type === "Program") {
          return <ContinueWatchingPoster item={item} />;
        }
        if (item.Type === "BoxSet" && !isHorizontal) {
          return <MoviePoster item={item} />;
        }
        if (item.Type === "BoxSet" && isHorizontal) {
          return <ContinueWatchingPoster item={item} />;
        }
        if (item.Type === "Playlist" && !isHorizontal) {
          return <MoviePoster item={item} />;
        }
        if (item.Type === "Playlist" && isHorizontal) {
          return <ContinueWatchingPoster item={item} />;
        }
        if (item.Type === "Video" && !isHorizontal) {
          return <MoviePoster item={item} />;
        }
        if (item.Type === "Video" && isHorizontal) {
          return <ContinueWatchingPoster item={item} />;
        }
        // Default fallback
        return isHorizontal ? (
          <ContinueWatchingPoster item={item} />
        ) : (
          <MoviePoster item={item} />
        );
      };

      return (
        <View style={{ marginRight: ITEM_GAP, width: itemWidth }}>
          <TVFocusablePoster
            onPress={() => handleItemPress(item)}
            hasTVPreferredFocus={isFirstItem}
            onFocus={handleItemFocus}
            onBlur={handleItemBlur}
          >
            {renderPoster()}
          </TVFocusablePoster>
          <TVItemCardText item={item} />
        </View>
      );
    },
    [
      orientation,
      isFirstSection,
      itemWidth,
      handleItemPress,
      handleItemFocus,
      handleItemBlur,
    ],
  );

  if (hideIfEmpty === true && allItems.length === 0 && !isLoading) return null;
  if (disabled || !title) return null;

  return (
    <View style={{ overflow: "visible" }} {...props}>
      {/* Section Header */}
      <Text
        style={{
          fontSize: 22,
          fontWeight: "600",
          color: "#FFFFFF",
          marginBottom: 16,
          marginLeft: SCALE_PADDING,
        }}
      >
        {title}
      </Text>

      {isLoading === false && allItems.length === 0 && (
        <Text
          style={{ color: "#737373", fontSize: 16, marginLeft: SCALE_PADDING }}
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
                    fontSize: 16,
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
          getItemLayout={getItemLayout}
          style={{ overflow: "visible" }}
          contentContainerStyle={{
            paddingVertical: SCALE_PADDING,
            paddingHorizontal: SCALE_PADDING,
          }}
          ListFooterComponent={
            isFetchingNextPage ? (
              <View
                style={{
                  marginLeft: 8,
                  justifyContent: "center",
                  height: orientation === "horizontal" ? 191 : 315,
                }}
              >
                <ActivityIndicator size='small' color={Colors.primary} />
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
};
