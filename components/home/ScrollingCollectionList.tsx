import { Text } from "@/components/common/Text";
import MoviePoster from "@/components/posters/MoviePoster";
import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import {
  useQuery,
  type QueryFunction,
  type QueryKey,
} from "@tanstack/react-query";
import { ScrollView, View, ViewProps, Platform } from "react-native";
import React, { useRef, useState, useEffect } from "react";
import ContinueWatchingPoster from "../ContinueWatchingPoster";
import { ItemCardText } from "../ItemCardText";
import { TouchableItemRouter } from "../common/TouchableItemRouter";
import SeriesPoster from "../posters/SeriesPoster";
import { useTranslation } from "react-i18next";

// Check if we're running on a TV platform
const isTV =
  Platform.isTV ||
  (Platform.OS === "android" &&
    !!Platform.constants.uiMode &&
    (Platform.constants.uiMode & 15) === 4);

interface Props extends ViewProps {
  title?: string | null;
  orientation?: "horizontal" | "vertical";
  disabled?: boolean;
  queryKey: QueryKey;
  queryFn: QueryFunction<BaseItemDto[]>;
  hideIfEmpty?: boolean;
}

export const ScrollingCollectionList: React.FC<Props> = ({
  title,
  orientation = "vertical",
  disabled = false,
  queryFn,
  queryKey,
  hideIfEmpty = false,
  ...props
}) => {
  const { data, isLoading } = useQuery({
    queryKey: queryKey,
    queryFn,
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  const { t } = useTranslation();
  const scrollViewRef = useRef<ScrollView>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const itemRefs = useRef<Array<any>>([]);
  const itemWidth = orientation === "horizontal" ? 176 : 112; // w-44 = 176px, w-28 = 112px

  // Initialize refs array when data changes
  useEffect(() => {
    if (data) {
      itemRefs.current = Array(data.length).fill(null);
    }
  }, [data]);

  // Handle focus change for TV navigation
  const handleItemFocus = (index: number) => {
    setFocusedIndex(index);

    // Ensure the focused item is visible by scrolling if needed
    if (isTV && scrollViewRef.current) {
      // Calculate the scroll position to make the focused item visible
      const scrollX = index * (itemWidth + 8) - 16; // 8px for margin, 16px for padding
      scrollViewRef.current.scrollTo({
        x: scrollX,
        animated: true,
      });
    }
  };

  if (hideIfEmpty === true && data?.length === 0) return null;
  if (disabled || !title) return null;

  return (
    <View {...props}>
      <Text className="px-4 text-lg font-bold mb-2 text-neutral-100">
        {title}
      </Text>
      {isLoading === false && data?.length === 0 && (
        <View className="px-4">
          <Text className="text-neutral-500">{t("home.no_items")}</Text>
        </View>
      )}
      {isLoading ? (
        <View
          className={`
            flex flex-row gap-2 px-4
        `}
        >
          {[1, 2, 3].map((i) => (
            <View className="w-44" key={i}>
              <View className="bg-neutral-900 h-24 w-full rounded-md mb-1"></View>
              <View className="rounded-md overflow-hidden mb-1 self-start">
                <Text
                  className="text-neutral-900 bg-neutral-900 rounded-md"
                  numberOfLines={1}
                >
                  Nisi mollit voluptate amet.
                </Text>
              </View>
              <View className="rounded-md overflow-hidden self-start mb-1">
                <Text
                  className="text-neutral-900 bg-neutral-900 text-xs rounded-md "
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
          ref={scrollViewRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16 }}
        >
          <View className="flex flex-row">
            {data?.map((item, index) => (
              <TouchableItemRouter
                item={item}
                key={item.Id}
                className={`mr-2 
                  ${orientation === "horizontal" ? "w-44" : "w-28"}
                `}
                ref={(ref) => {
                  itemRefs.current[index] = ref;
                }}
                onFocus={() => handleItemFocus(index)}
                {...(isTV && {
                  hasTVPreferredFocus: index === 0,
                  tvParallaxProperties: { enabled: false },
                })}
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
          </View>
        </ScrollView>
      )}
    </View>
  );
};
