import React, { useMemo } from "react";
import DiscoverSlider from "@/utils/jellyseerr/server/entity/DiscoverSlider";
import { DiscoverSliderType } from "@/utils/jellyseerr/server/constants/discover";
import {
  DiscoverEndpoint,
  Endpoints,
  useJellyseerr,
} from "@/hooks/useJellyseerr";
import { useInfiniteQuery } from "@tanstack/react-query";
import { MovieResult, TvResult } from "@/utils/jellyseerr/server/models/Search";
import JellyseerrPoster from "@/components/posters/JellyseerrPoster";
import { Text } from "@/components/common/Text";
import { FlashList } from "@shopify/flash-list";
import { View } from "react-native";

interface Props {
  slide: DiscoverSlider;
}
const DiscoverSlide: React.FC<Props> = ({ slide }) => {
  const { jellyseerrApi } = useJellyseerr();

  const { data, isFetching, fetchNextPage, hasNextPage } = useInfiniteQuery({
    queryKey: ["jellyseerr", "discover", slide.id],
    queryFn: async ({ pageParam }) => {
      let endpoint: DiscoverEndpoint | undefined = undefined;
      let params: any = {
        page: Number(pageParam),
      };

      switch (slide.type) {
        case DiscoverSliderType.TRENDING:
          endpoint = Endpoints.DISCOVER_TRENDING;
          break;
        case DiscoverSliderType.POPULAR_MOVIES:
        case DiscoverSliderType.UPCOMING_MOVIES:
          endpoint = Endpoints.DISCOVER_MOVIES;
          if (slide.type === DiscoverSliderType.UPCOMING_MOVIES)
            params = {
              ...params,
              primaryReleaseDateGte: new Date().toISOString().split("T")[0],
            };
          break;
        case DiscoverSliderType.POPULAR_TV:
        case DiscoverSliderType.UPCOMING_TV:
          endpoint = Endpoints.DISCOVER_TV;
          if (slide.type === DiscoverSliderType.UPCOMING_TV)
            params = {
              ...params,
              firstAirDateGte: new Date().toISOString().split("T")[0],
            };
          break;
      }

      return endpoint ? jellyseerrApi?.discover(endpoint, params) : null;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, pages) =>
      (lastPage?.page || pages?.findLast((p) => p?.results.length)?.page || 1) +
      1,
    enabled: !!jellyseerrApi,
    staleTime: 0,
  });

  const flatData = useMemo(
    () =>
      data?.pages?.filter((p) => p?.results.length).flatMap((p) => p?.results),
    [data]
  );

  return (
    flatData &&
    flatData?.length > 0 && (
      <View className="mb-4">
        <Text className="font-bold text-lg mb-2 px-4">
          {DiscoverSliderType[slide.type].toString().toTitle()}
        </Text>
        <FlashList
          horizontal
          contentContainerStyle={{
            paddingLeft: 16,
          }}
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item!!.id.toString()}
          estimatedItemSize={250}
          data={flatData}
          onEndReachedThreshold={1}
          onEndReached={() => {
            if (hasNextPage) fetchNextPage();
          }}
          renderItem={({ item }) =>
            item ? (
              <JellyseerrPoster item={item as MovieResult | TvResult} />
            ) : (
              <></>
            )
          }
        />
      </View>
    )
  );
};

export default DiscoverSlide;
