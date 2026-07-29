import { Ionicons } from "@expo/vector-icons";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { uniqBy } from "lodash";
import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Animated, FlatList, Pressable, View } from "react-native";
import { Text } from "@/components/common/Text";
import { useTVFocusAnimation } from "@/components/tv/hooks/useTVFocusAnimation";
import { useScaledTVSizes } from "@/constants/TVSizes";
import { useScaledTVTypography } from "@/constants/TVTypography";
import useRouter from "@/hooks/useAppRouter";
import {
  type DiscoverEndpoint,
  Endpoints,
  useJellyseerr,
} from "@/hooks/useJellyseerr";
import { DiscoverSliderType } from "@/utils/jellyseerr/server/constants/discover";
import { MediaStatus } from "@/utils/jellyseerr/server/constants/media";
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
  const typography = useScaledTVTypography();
  const router = useRouter();
  const { jellyseerrApi, getTitle, getYear } = useJellyseerr();
  const { focused, handleFocus, handleBlur, animatedStyle } =
    useTVFocusAnimation({ scaleAmount: 1.05 });

  const posterUrl = item.posterPath
    ? jellyseerrApi?.imageProxy(item.posterPath, "w342")
    : null;

  const title = getTitle(item);
  const year = getYear(item);

  const isInLibrary =
    item.mediaInfo?.status === MediaStatus.AVAILABLE ||
    item.mediaInfo?.status === MediaStatus.PARTIALLY_AVAILABLE;

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
            width: 210,
            shadowColor: "#fff",
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: focused ? 0.6 : 0,
            shadowRadius: focused ? 20 : 0,
          },
        ]}
      >
        <View
          style={{
            width: 210,
            aspectRatio: 10 / 15,
            borderRadius: 24,
            overflow: "hidden",
            backgroundColor: "rgba(255,255,255,0.1)",
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
          {isInLibrary && (
            <View
              style={{
                position: "absolute",
                top: 8,
                right: 8,
                backgroundColor: "rgba(255,255,255,0.9)",
                borderRadius: 14,
                width: 28,
                height: 28,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name='checkmark' size={18} color='black' />
            </View>
          )}
        </View>
        <Text
          style={{
            fontSize: typography.callout,
            color: "#fff",
            fontWeight: "600",
            marginTop: 12,
          }}
          numberOfLines={2}
        >
          {title}
        </Text>
        {year && (
          <Text
            style={{
              fontSize: typography.callout,
              color: "#9CA3AF",
              marginTop: 2,
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
  const typography = useScaledTVTypography();
  const sizes = useScaledTVSizes();
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
          <TVDiscoverPoster
            item={item}
            isFirstItem={isFirstSlide && index === 0}
          />
        )}
      />
    </View>
  );
};
