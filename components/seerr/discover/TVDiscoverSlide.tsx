import { useInfiniteQuery } from "@tanstack/react-query";
import { uniqBy } from "lodash";
import React, { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { TVSeerrRow } from "@/components/seerr/discover/TVSeerrRow";
import { TVSeerrPosterCard } from "@/components/tv/TVSeerrPosterCard";
import useRouter from "@/hooks/useAppRouter";
import { type DiscoverEndpoint, Endpoints, useSeerr } from "@/hooks/useSeerr";
import type {
  DiscoverSlider,
  MovieResult,
  TvResult,
} from "@/utils/seerr/types";
import { DiscoverSliderType } from "@/utils/seerr/types";

interface TVDiscoverSlideProps {
  slide: DiscoverSlider;
  isFirstSlide?: boolean;
}

export const TVDiscoverSlide: React.FC<TVDiscoverSlideProps> = ({
  slide,
  isFirstSlide = false,
}) => {
  const { t } = useTranslation();
  const router = useRouter();
  const { seerrApi, isSeerrMovieOrTvResult } = useSeerr();

  const handleItemPress = useCallback(
    (item: MovieResult | TvResult) => {
      router.push({
        pathname: "/(auth)/(tabs)/(search)/seerr/page",
        params: {
          id: String(item.id),
          mediaType: item.mediaType,
        },
      });
    },
    [router],
  );

  const { data, fetchNextPage, hasNextPage } = useInfiniteQuery({
    queryKey: ["seerr", "discover", "tv", slide.id],
    queryFn: async ({ pageParam }) => {
      let endpoint: DiscoverEndpoint | undefined;
      let params: Record<string, unknown> = {
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
      ) as (MovieResult | TvResult)[],
    [data, isSeerrMovieOrTvResult],
  );

  const slideTitle = t(
    `search.${DiscoverSliderType[slide.type].toString().toLowerCase()}`,
  );

  if (!flatData || flatData.length === 0) return null;

  return (
    <TVSeerrRow
      title={slideTitle}
      data={flatData}
      keyExtractor={(item) => item.id.toString()}
      onEndReached={() => {
        if (hasNextPage) fetchNextPage();
      }}
      renderItem={(item, index) => (
        <TVSeerrPosterCard
          item={item}
          onPress={() => handleItemPress(item)}
          hasTVPreferredFocus={isFirstSlide && index === 0}
        />
      )}
    />
  );
};
