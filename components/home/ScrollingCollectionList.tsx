import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import {
  type QueryFunction,
  type QueryKey,
  useQuery,
} from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ScrollView, View, type ViewProps } from "react-native";
import { Text } from "@/components/common/Text";
import MoviePoster from "@/components/posters/MoviePoster";
import { useInView } from "@/hooks/useInView";
import ContinueWatchingPoster from "../ContinueWatchingPoster";
import { TouchableItemRouter } from "../common/TouchableItemRouter";
import { ItemCardText } from "../ItemCardText";
import SeriesPoster from "../posters/SeriesPoster";

interface Props extends ViewProps {
  title?: string | null;
  orientation?: "horizontal" | "vertical";
  disabled?: boolean;
  queryKey: QueryKey;
  queryFn: QueryFunction<BaseItemDto[]>;
  hideIfEmpty?: boolean;
  isOffline?: boolean;
  scrollY?: number; // For lazy loading
  enableLazyLoading?: boolean; // Enable/disable lazy loading
}

export const ScrollingCollectionList: React.FC<Props> = ({
  title,
  orientation = "vertical",
  disabled = false,
  queryFn,
  queryKey,
  hideIfEmpty = false,
  isOffline = false,
  scrollY = 0,
  enableLazyLoading = false,
  ...props
}) => {
  const { ref, isInView, onLayout } = useInView(scrollY, {
    enabled: enableLazyLoading,
  });

  const { data, isLoading } = useQuery({
    queryKey: queryKey,
    queryFn,
    staleTime: 60 * 1000, // 1 minute
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    enabled: enableLazyLoading ? isInView : true,
  });

  const { t } = useTranslation();

  // Show skeleton if loading OR if lazy loading is enabled and not in view yet
  const shouldShowSkeleton = isLoading || (enableLazyLoading && !isInView);

  if (hideIfEmpty === true && data?.length === 0 && !shouldShowSkeleton)
    return null;
  if (disabled || !title) return null;

  return (
    <View ref={ref} onLayout={onLayout} {...props}>
      <Text className='px-4 text-lg font-bold mb-2 text-neutral-100'>
        {title}
      </Text>
      {!shouldShowSkeleton && data?.length === 0 && (
        <View className='px-4'>
          <Text className='text-neutral-500'>{t("home.no_items")}</Text>
        </View>
      )}
      {shouldShowSkeleton ? (
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
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View className='px-4 flex flex-row'>
            {data?.map((item) => (
              <TouchableItemRouter
                item={item}
                key={item.Id}
                isOffline={isOffline}
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
                <ItemCardText item={item} />
              </TouchableItemRouter>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
};
