import { useInfiniteQuery } from "@tanstack/react-query";
import { uniqBy } from "lodash";
import type React from "react";
import { useMemo } from "react";
import type { ViewProps } from "react-native";
import SeerrPoster from "@/components/posters/SeerrPoster";
import Slide, { type SlideProps } from "@/components/seerr/discover/Slide";
import { type DiscoverEndpoint, Endpoints, useSeerr } from "@/hooks/useSeerr";
import { DiscoverSliderType } from "@/utils/jellyseerr/server/constants/discover";

const MovieTvSlide: React.FC<SlideProps & ViewProps> = ({
  slide,
  ...props
}) => {
  const { seerrApi, isSeerrMovieOrTvResult } = useSeerr();

  const { data, fetchNextPage, hasNextPage } = useInfiniteQuery({
    queryKey: ["seerr", "discover", slide.id],
    queryFn: async ({ pageParam }) => {
      let endpoint: DiscoverEndpoint | undefined;
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

      return endpoint ? seerrApi?.discover(endpoint, params) : null;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, pages) =>
      (lastPage?.page || pages?.findLast((p) => p?.results.length)?.page || 1) +
      1,
    enabled: !!seerrApi,
    staleTime: 0,
  });

  const flatData = useMemo(
    () =>
      uniqBy(
        data?.pages
          ?.filter((p) => p?.results.length)
          .flatMap((p) => p?.results.filter((r) => isSeerrMovieOrTvResult(r))),
        "id",
      ),
    [data, isSeerrMovieOrTvResult],
  );

  return (
    flatData &&
    flatData?.length > 0 && (
      <Slide
        {...props}
        slide={slide}
        data={flatData}
        keyExtractor={(item) => item!.id.toString()}
        onEndReached={() => {
          if (hasNextPage) fetchNextPage();
        }}
        renderItem={(item) => <SeerrPoster item={item} key={item?.id} />}
      />
    )
  );
};

export default MovieTvSlide;
