import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import {
  type QueryFunction,
  type QueryKey,
  useInfiniteQuery,
} from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  ScrollView,
  View,
  type ViewProps,
} from "react-native";
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
}

export const InfiniteScrollingCollectionList: React.FC<Props> = ({
  title,
  orientation = "vertical",
  disabled = false,
  queryFn,
  queryKey,
  hideIfEmpty = false,
  pageSize = 10,
  ...props
}) => {
  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } =
    useInfiniteQuery({
      queryKey: queryKey,
      queryFn: ({ pageParam = 0, ...context }) =>
        queryFn({ ...context, queryKey, pageParam }),
      getNextPageParam: (lastPage, allPages) => {
        // If the last page has fewer items than pageSize, we've reached the end
        if (lastPage.length < pageSize) {
          return undefined;
        }
        // Otherwise, return the next start index
        return allPages.length * pageSize;
      },
      initialPageParam: 0,
      staleTime: 60 * 1000, // 1 minute
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    });

  const { t } = useTranslation();

  // Flatten all pages into a single array
  const allItems = data?.pages.flat() || [];

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
      <Text className='px-4 text-lg font-bold mb-2 text-neutral-100'>
        {title}
      </Text>
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
        >
          <View className='px-4 flex flex-row'>
            {allItems.map((item) => (
              <TouchableItemRouter
                item={item}
                key={item.Id}
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
