import { useInfiniteQuery } from "@tanstack/react-query";
import { uniqBy } from "lodash";
import React, { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { FlatList, View } from "react-native";
import { Text } from "@/components/common/Text";
import { TVJellyseerrPosterCard } from "@/components/tv/TVJellyseerrPosterCard";
import { useScaledTVSizes } from "@/constants/TVSizes";
import { useScaledTVTypography } from "@/constants/TVTypography";
import useRouter from "@/hooks/useAppRouter";
import {
  type DiscoverEndpoint,
  Endpoints,
  useJellyseerr,
} from "@/hooks/useJellyseerr";
import { DiscoverSliderType } from "@/utils/jellyseerr/server/constants/discover";
import type DiscoverSlider from "@/utils/jellyseerr/server/entity/DiscoverSlider";
import type {
  MovieResult,
  TvResult,
} from "@/utils/jellyseerr/server/models/Search";

const SCALE_PADDING = 20;

interface TVDiscoverSlideProps {
  slide: DiscoverSlider;
  isFirstSlide?: boolean;
}

export const TVDiscoverSlide: React.FC<TVDiscoverSlideProps> = ({
  slide,
  isFirstSlide = false,
}) => {
  const typography = useScaledTVTypography();
  const sizes = useScaledTVSizes();
  const { t } = useTranslation();
  const router = useRouter();
  const { jellyseerrApi, isJellyseerrMovieOrTvResult } = useJellyseerr();

  const handleItemPress = useCallback(
    (item: MovieResult | TvResult) => {
      router.push({
        pathname: "/(auth)/(tabs)/(search)/jellyseerr/page",
        params: {
          id: String(item.id),
          mediaType: item.mediaType,
        },
      });
    },
    [router],
  );

  const { data, fetchNextPage, hasNextPage } = useInfiniteQuery({
    queryKey: ["jellyseerr", "discover", "tv", slide.id],
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
          .flatMap((p) =>
            p?.results.filter((r) => isJellyseerrMovieOrTvResult(r)),
          ),
        "id",
      ) as (MovieResult | TvResult)[],
    [data, isJellyseerrMovieOrTvResult],
  );

  const slideTitle = t(
    `search.${DiscoverSliderType[slide.type].toString().toLowerCase()}`,
  );

  if (!flatData || flatData.length === 0) return null;

  return (
    <View style={{ marginBottom: 24 }}>
      <Text
        style={{
          fontSize: typography.heading,
          fontWeight: "bold",
          color: "#FFFFFF",
          marginBottom: 16,
          marginLeft: sizes.padding.horizontal,
        }}
      >
        {slideTitle}
      </Text>
      <FlatList
        horizontal
        data={flatData}
        keyExtractor={(item) => item.id.toString()}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: sizes.padding.horizontal,
          paddingVertical: SCALE_PADDING,
          gap: 20,
        }}
        style={{ overflow: "visible" }}
        onEndReached={() => {
          if (hasNextPage) fetchNextPage();
        }}
        onEndReachedThreshold={0.5}
        renderItem={({ item, index }) => (
          <TVJellyseerrPosterCard
            item={item}
            onPress={() => handleItemPress(item)}
            hasTVPreferredFocus={isFirstSlide && index === 0}
          />
        )}
      />
    </View>
  );
};
