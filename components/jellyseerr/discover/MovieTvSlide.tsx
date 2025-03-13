import React, { useMemo } from "react";
import { DiscoverSliderType } from "@/utils/jellyseerr/server/constants/discover";
import {
  DiscoverEndpoint,
  Endpoints,
  useJellyseerr,
} from "@/hooks/useJellyseerr";
import { useInfiniteQuery } from "@tanstack/react-query";
import { MovieResult, TvResult } from "@/utils/jellyseerr/server/models/Search";
import JellyseerrPoster from "@/components/posters/JellyseerrPoster";
import Slide, { SlideProps } from "@/components/jellyseerr/discover/Slide";
import { ViewProps, Platform, View, ScrollView } from "react-native";
import { uniqBy } from "lodash";

const MovieTvSlide: React.FC<SlideProps & ViewProps> = ({
  slide,
  ...props
}) => {
  const { jellyseerrApi } = useJellyseerr();

  const { data, fetchNextPage, hasNextPage } = useInfiniteQuery({
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
      uniqBy(
        data?.pages
          ?.filter((p) => p?.results.length)
          .flatMap((p) => p?.results),
        "id",
      ),
    [data],
  );

  // For TV platforms, use a simple ScrollView with horizontal layout
  if (Platform.isTV) {
    return (
      flatData &&
      flatData?.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0 }}
          contentContainerStyle={{ paddingHorizontal: 10 }}
        >
          {flatData.map((item) => (
            <View key={item?.id} style={{ marginHorizontal: 5 }}>
              <JellyseerrPoster item={item as MovieResult | TvResult} />
            </View>
          ))}
        </ScrollView>
      )
    );
  }

  // For mobile platforms, use the original Slide component
  return (
    flatData &&
    flatData?.length > 0 && (
      <Slide
        {...props}
        slide={slide}
        data={flatData}
        keyExtractor={(item) => item!!.id.toString()}
        onEndReached={() => {
          if (hasNextPage) fetchNextPage();
        }}
        renderItem={(item) => (
          <JellyseerrPoster
            item={item as MovieResult | TvResult}
            key={item?.id}
          />
        )}
      />
    )
  );
};

export default MovieTvSlide;
