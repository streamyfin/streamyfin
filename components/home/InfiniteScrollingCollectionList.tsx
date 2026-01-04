import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import {
  type QueryFunction,
  type QueryKey,
  useInfiniteQuery,
} from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  ScrollView,
  View,
  type ViewProps,
} from "react-native";
import { SectionHeader } from "@/components/common/SectionHeader";
import { Text } from "@/components/common/Text";
import MoviePoster from "@/components/posters/MoviePoster";
import { Colors } from "../../constants/Colors";
import ContinueWatchingPoster from "../ContinueWatchingPoster";
import { TouchableItemRouter } from "../common/TouchableItemRouter";
import { ItemCardText } from "../ItemCardText";
import SeriesPoster from "../posters/SeriesPoster";

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
}

export const InfiniteScrollingCollectionList: React.FC<Props> = ({
  title,
  orientation = "vertical",
  disabled = false,
  queryFn,
  queryKey,
  hideIfEmpty = false,
  pageSize = 10,
  onPressSeeAll,
  enabled = true,
  onLoaded,
  ...props
}) => {
  const effectivePageSize = Math.max(1, pageSize);
  const hasCalledOnLoaded = useRef(false);
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
      // If the last page has fewer items than pageSize, we've reached the end
      if (lastPage.length < effectivePageSize) {
        return undefined;
      }
      // Otherwise, return the next start index based on how many items we already loaded.
      // This avoids overlaps if the server/page size differs from our configured page size.
      return allPages.reduce((acc, page) => acc + page.length, 0);
    },
    initialPageParam: 0,
    staleTime: 60 * 1000, // 1 minute
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    enabled,
  });

  // Notify parent when data has loaded
  useEffect(() => {
    if (isSuccess && !hasCalledOnLoaded.current && onLoaded) {
      hasCalledOnLoaded.current = true;
      onLoaded();
    }
  }, [isSuccess, onLoaded]);

  const { t } = useTranslation();

  // Flatten all pages into a single array (and de-dupe by Id to avoid UI duplicates)
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

  const snapOffsets = useMemo(() => {
    const itemWidth = orientation === "horizontal" ? 184 : 120; // w-44 (176px) + mr-2 (8px) or w-28 (112px) + mr-2 (8px)
    return allItems.map((_, index) => index * itemWidth);
  }, [allItems, orientation]);

  if (hideIfEmpty === true && allItems.length === 0 && !isLoading) return null;
  if (disabled || !title) return null;

  const handleScroll = (event: any) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const paddingToBottom = 20;

    // Check if we're near the end of the scroll
    if (
      layoutMeasurement.width + contentOffset.x >=
      contentSize.width - paddingToBottom
    ) {
      if (hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    }
  };

  return (
    <View {...props}>
      <SectionHeader
        title={title}
        actionLabel={t("common.seeAll", { defaultValue: "See all" })}
        actionDisabled={isLoading}
        onPressAction={onPressSeeAll}
      />
      {isLoading === false && allItems.length === 0 && (
        <View className='px-4'>
          <Text className='text-neutral-500'>{t("home.no_items")}</Text>
        </View>
      )}
      {isLoading ? (
        <View
          className={`
            flex flex-row gap-2 px-4
        `}
        >
          {[1, 2, 3].map((i) => (
            <View className='w-44' key={i}>
              <View className='bg-neutral-900 h-24 w-full rounded-md mb-1' />
              <View className='rounded-md overflow-hidden mb-1 self-start'>
                <Text
                  className='text-neutral-900 bg-neutral-900 rounded-md'
                  numberOfLines={1}
                >
                  Nisi mollit voluptate amet.
                </Text>
              </View>
              <View className='rounded-md overflow-hidden self-start mb-1'>
                <Text
                  className='text-neutral-900 bg-neutral-900 text-xs rounded-md '
                  numberOfLines={1}
                >
                  Lorem ipsum
                </Text>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          snapToOffsets={snapOffsets}
          decelerationRate='fast'
        >
          <View className='px-4 flex flex-row'>
            {allItems.map((item, index) => (
              <TouchableItemRouter
                item={item}
                key={`${item.Id}-${index}`}
                className={`mr-2
                  ${orientation === "horizontal" ? "w-44" : "w-28"}
                `}
              >
                {item.Type === "Episode" && orientation === "horizontal" && (
                  <ContinueWatchingPoster item={item} />
                )}
                {item.Type === "Episode" && orientation === "vertical" && (
                  <SeriesPoster item={item} />
                )}
                {item.Type === "Movie" && orientation === "horizontal" && (
                  <ContinueWatchingPoster item={item} />
                )}
                {item.Type === "Movie" && orientation === "vertical" && (
                  <MoviePoster item={item} />
                )}
                {item.Type === "Series" && orientation === "vertical" && (
                  <SeriesPoster item={item} />
                )}
                {item.Type === "Series" && orientation === "horizontal" && (
                  <ContinueWatchingPoster item={item} />
                )}
                {item.Type === "Program" && (
                  <ContinueWatchingPoster item={item} />
                )}
                {item.Type === "BoxSet" && orientation === "vertical" && (
                  <MoviePoster item={item} />
                )}
                {item.Type === "BoxSet" && orientation === "horizontal" && (
                  <ContinueWatchingPoster item={item} />
                )}
                {item.Type === "Playlist" && orientation === "vertical" && (
                  <MoviePoster item={item} />
                )}
                {item.Type === "Playlist" && orientation === "horizontal" && (
                  <ContinueWatchingPoster item={item} />
                )}
                {item.Type === "Video" && orientation === "vertical" && (
                  <MoviePoster item={item} />
                )}
                {item.Type === "Video" && orientation === "horizontal" && (
                  <ContinueWatchingPoster item={item} />
                )}
                <ItemCardText item={item} />
              </TouchableItemRouter>
            ))}
            {/* Loading indicator for next page */}
            {isFetchingNextPage && (
              <View
                style={{
                  marginLeft: 8,
                  marginTop: orientation === "horizontal" ? 37 : 70,
                }}
              >
                <ActivityIndicator size='small' color={Colors.primary} />
              </View>
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
};
