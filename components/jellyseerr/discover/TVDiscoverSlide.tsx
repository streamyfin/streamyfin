import { Ionicons } from "@expo/vector-icons";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { uniqBy } from "lodash";
import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Animated, FlatList, Pressable, View } from "react-native";
import { Text } from "@/components/common/Text";
import { useTVFocusAnimation } from "@/components/tv/hooks/useTVFocusAnimation";
import { TVTypography } from "@/constants/TVTypography";
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

interface TVDiscoverPosterProps {
  item: MovieResult | TvResult;
  isFirstItem?: boolean;
}

const TVDiscoverPoster: React.FC<TVDiscoverPosterProps> = ({
  item,
  isFirstItem = false,
}) => {
  const router = useRouter();
  const { jellyseerrApi, getTitle, getYear } = useJellyseerr();
  const { focused, handleFocus, handleBlur, animatedStyle } =
    useTVFocusAnimation({ scaleAmount: 1.08 });

  const posterUrl = item.posterPath
    ? jellyseerrApi?.imageProxy(item.posterPath, "w342")
    : null;

  const title = getTitle(item);
  const year = getYear(item);

  const handlePress = () => {
    router.push({
      pathname: "/(auth)/(tabs)/(search)/jellyseerr/page",
      params: {
        id: String(item.id),
        mediaType: item.mediaType,
      },
    });
  };

  return (
    <Pressable
      onPress={handlePress}
      onFocus={handleFocus}
      onBlur={handleBlur}
      hasTVPreferredFocus={isFirstItem}
    >
      <Animated.View
        style={[
          animatedStyle,
          {
            width: 180,
            shadowColor: "#fff",
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: focused ? 0.4 : 0,
            shadowRadius: focused ? 12 : 0,
          },
        ]}
      >
        <View
          style={{
            width: 180,
            aspectRatio: 2 / 3,
            borderRadius: 12,
            overflow: "hidden",
            backgroundColor: "rgba(255,255,255,0.1)",
            borderWidth: focused ? 3 : 0,
            borderColor: "#fff",
          }}
        >
          {posterUrl ? (
            <Image
              source={{ uri: posterUrl }}
              style={{ width: "100%", height: "100%" }}
              contentFit='cover'
              cachePolicy='memory-disk'
            />
          ) : (
            <View
              style={{
                flex: 1,
                justifyContent: "center",
                alignItems: "center",
                backgroundColor: "#262626",
              }}
            >
              <Ionicons
                name='image-outline'
                size={40}
                color='rgba(255,255,255,0.3)'
              />
            </View>
          )}
        </View>
        <Text
          style={{
            fontSize: TVTypography.callout,
            color: focused ? "#fff" : "rgba(255,255,255,0.9)",
            fontWeight: "600",
            marginTop: 10,
          }}
          numberOfLines={2}
        >
          {title}
        </Text>
        {year && (
          <Text
            style={{
              fontSize: 14,
              color: focused
                ? "rgba(255,255,255,0.7)"
                : "rgba(255,255,255,0.5)",
            }}
          >
            {year}
          </Text>
        )}
      </Animated.View>
    </Pressable>
  );
};

interface TVDiscoverSlideProps {
  slide: DiscoverSlider;
  isFirstSlide?: boolean;
}

export const TVDiscoverSlide: React.FC<TVDiscoverSlideProps> = ({
  slide,
  isFirstSlide = false,
}) => {
  const { t } = useTranslation();
  const { jellyseerrApi, isJellyseerrMovieOrTvResult } = useJellyseerr();

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
          fontSize: TVTypography.heading,
          fontWeight: "bold",
          color: "#FFFFFF",
          marginBottom: 16,
          marginLeft: SCALE_PADDING,
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
          paddingHorizontal: SCALE_PADDING,
          paddingVertical: SCALE_PADDING,
          gap: 20,
        }}
        style={{ overflow: "visible" }}
        onEndReached={() => {
          if (hasNextPage) fetchNextPage();
        }}
        onEndReachedThreshold={0.5}
        renderItem={({ item, index }) => (
          <TVDiscoverPoster
            item={item}
            isFirstItem={isFirstSlide && index === 0}
          />
        )}
      />
    </View>
  );
};
