import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React from "react";
import { useTranslation } from "react-i18next";
import { Animated, FlatList, Pressable, View } from "react-native";
import { Text } from "@/components/common/Text";
import { useTVFocusAnimation } from "@/components/tv/hooks/useTVFocusAnimation";
import { useScaledTVSizes } from "@/constants/TVSizes";
import { useScaledTVTypography } from "@/constants/TVTypography";
import { useJellyseerr } from "@/hooks/useJellyseerr";
import { MediaStatus } from "@/utils/jellyseerr/server/constants/media";
import type {
  MovieResult,
  PersonResult,
  TvResult,
} from "@/utils/jellyseerr/server/models/Search";

interface TVJellyseerrPosterProps {
  item: MovieResult | TvResult;
  onPress: () => void;
  isFirstItem?: boolean;
}

const TVJellyseerrPoster: React.FC<TVJellyseerrPosterProps> = ({
  item,
  onPress,
  isFirstItem = false,
}) => {
  const typography = useScaledTVTypography();
  const sizes = useScaledTVSizes();
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

  const posterWidth = sizes.posters.poster;

  return (
    <Pressable
      onPress={onPress}
      onFocus={handleFocus}
      onBlur={handleBlur}
      hasTVPreferredFocus={isFirstItem}
    >
      <Animated.View
        style={[
          animatedStyle,
          {
            width: posterWidth,
            shadowColor: "#fff",
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: focused ? 0.6 : 0,
            shadowRadius: focused ? 20 : 0,
          },
        ]}
      >
        <View
          style={{
            width: posterWidth,
            aspectRatio: 10 / 15,
            borderRadius: sizes.gaps.small,
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
            marginTop: sizes.gaps.small,
          }}
          numberOfLines={2}
        >
          {title}
        </Text>
        {year != null && (
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

interface TVJellyseerrPersonPosterProps {
  item: PersonResult;
  onPress: () => void;
}

const TVJellyseerrPersonPoster: React.FC<TVJellyseerrPersonPosterProps> = ({
  item,
  onPress,
}) => {
  const typography = useScaledTVTypography();
  const sizes = useScaledTVSizes();
  const { jellyseerrApi } = useJellyseerr();
  const { focused, handleFocus, handleBlur, animatedStyle } =
    useTVFocusAnimation();

  const posterUrl = item.profilePath
    ? jellyseerrApi?.imageProxy(item.profilePath, "w185")
    : null;

  const avatarSize = Math.round(sizes.posters.poster * 0.67);

  return (
    <Pressable onPress={onPress} onFocus={handleFocus} onBlur={handleBlur}>
      <Animated.View
        style={[
          animatedStyle,
          {
            width: avatarSize,
            alignItems: "center",
            shadowColor: "#fff",
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: focused ? 0.4 : 0,
            shadowRadius: focused ? 12 : 0,
          },
        ]}
      >
        <View
          style={{
            width: avatarSize,
            height: avatarSize,
            borderRadius: avatarSize / 2,
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
              }}
            >
              <Ionicons
                name='person'
                size={Math.round(avatarSize * 0.35)}
                color='rgba(255,255,255,0.4)'
              />
            </View>
          )}
        </View>
        <Text
          style={{
            fontSize: typography.callout,
            color: focused ? "#fff" : "rgba(255,255,255,0.9)",
            fontWeight: "600",
            marginTop: sizes.gaps.small,
            textAlign: "center",
          }}
          numberOfLines={2}
        >
          {item.name}
        </Text>
      </Animated.View>
    </Pressable>
  );
};

interface TVJellyseerrMovieSectionProps {
  title: string;
  items: MovieResult[];
  isFirstSection?: boolean;
  onItemPress: (item: MovieResult) => void;
}

const TVJellyseerrMovieSection: React.FC<TVJellyseerrMovieSectionProps> = ({
  title,
  items,
  isFirstSection = false,
  onItemPress,
}) => {
  const typography = useScaledTVTypography();
  const sizes = useScaledTVSizes();
  if (!items || items.length === 0) return null;

  return (
    <View style={{ marginBottom: sizes.gaps.section }}>
      <Text
        style={{
          fontSize: typography.heading,
          fontWeight: "bold",
          color: "#FFFFFF",
          marginBottom: sizes.gaps.small,
          marginLeft: sizes.padding.scale,
        }}
      >
        {title}
      </Text>
      <FlatList
        horizontal
        data={items}
        keyExtractor={(item) => item.id.toString()}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: sizes.padding.scale,
          paddingVertical: sizes.padding.scale,
          gap: sizes.gaps.item,
        }}
        style={{ overflow: "visible" }}
        renderItem={({ item, index }) => (
          <TVJellyseerrPoster
            item={item}
            onPress={() => onItemPress(item)}
            isFirstItem={isFirstSection && index === 0}
          />
        )}
      />
    </View>
  );
};

interface TVJellyseerrTvSectionProps {
  title: string;
  items: TvResult[];
  isFirstSection?: boolean;
  onItemPress: (item: TvResult) => void;
}

const TVJellyseerrTvSection: React.FC<TVJellyseerrTvSectionProps> = ({
  title,
  items,
  isFirstSection = false,
  onItemPress,
}) => {
  const typography = useScaledTVTypography();
  const sizes = useScaledTVSizes();
  if (!items || items.length === 0) return null;

  return (
    <View style={{ marginBottom: sizes.gaps.section }}>
      <Text
        style={{
          fontSize: typography.heading,
          fontWeight: "bold",
          color: "#FFFFFF",
          marginBottom: sizes.gaps.small,
          marginLeft: sizes.padding.scale,
        }}
      >
        {title}
      </Text>
      <FlatList
        horizontal
        data={items}
        keyExtractor={(item) => item.id.toString()}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: sizes.padding.scale,
          paddingVertical: sizes.padding.scale,
          gap: sizes.gaps.item,
        }}
        style={{ overflow: "visible" }}
        renderItem={({ item, index }) => (
          <TVJellyseerrPoster
            item={item}
            onPress={() => onItemPress(item)}
            isFirstItem={isFirstSection && index === 0}
          />
        )}
      />
    </View>
  );
};

interface TVJellyseerrPersonSectionProps {
  title: string;
  items: PersonResult[];
  isFirstSection?: boolean;
  onItemPress: (item: PersonResult) => void;
}

const TVJellyseerrPersonSection: React.FC<TVJellyseerrPersonSectionProps> = ({
  title,
  items,
  isFirstSection: _isFirstSection = false,
  onItemPress,
}) => {
  const typography = useScaledTVTypography();
  const sizes = useScaledTVSizes();
  if (!items || items.length === 0) return null;

  return (
    <View style={{ marginBottom: sizes.gaps.section }}>
      <Text
        style={{
          fontSize: typography.heading,
          fontWeight: "bold",
          color: "#FFFFFF",
          marginBottom: sizes.gaps.small,
          marginLeft: sizes.padding.scale,
        }}
      >
        {title}
      </Text>
      <FlatList
        horizontal
        data={items}
        keyExtractor={(item) => item.id.toString()}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: sizes.padding.scale,
          paddingVertical: sizes.padding.scale,
          gap: sizes.gaps.item,
        }}
        style={{ overflow: "visible" }}
        renderItem={({ item }) => (
          <TVJellyseerrPersonPoster
            item={item}
            onPress={() => onItemPress(item)}
          />
        )}
      />
    </View>
  );
};

export interface TVJellyseerrSearchResultsProps {
  movieResults: MovieResult[];
  tvResults: TvResult[];
  personResults: PersonResult[];
  loading: boolean;
  noResults: boolean;
  searchQuery: string;
  onMoviePress: (item: MovieResult) => void;
  onTvPress: (item: TvResult) => void;
  onPersonPress: (item: PersonResult) => void;
}

export const TVJellyseerrSearchResults: React.FC<
  TVJellyseerrSearchResultsProps
> = ({
  movieResults,
  tvResults,
  personResults,
  loading,
  noResults,
  searchQuery,
  onMoviePress,
  onTvPress,
  onPersonPress,
}) => {
  const { t } = useTranslation();
  const typography = useScaledTVTypography();

  if (loading) {
    return null;
  }

  if (noResults && searchQuery.length > 0) {
    return (
      <View style={{ alignItems: "center", paddingTop: 40 }}>
        <Text
          style={{
            fontSize: typography.heading,
            fontWeight: "bold",
            color: "#FFFFFF",
            marginBottom: 8,
          }}
        >
          {t("search.no_results_found_for")}
        </Text>
        <Text
          style={{ fontSize: typography.body, color: "rgba(255,255,255,0.6)" }}
        >
          "{searchQuery}"
        </Text>
      </View>
    );
  }

  return (
    <View>
      {/* No section requests `hasTVPreferredFocus`: the native search field
          keeps focus while typing, otherwise the first result would re-grab
          focus on every keystroke as results re-render. The user navigates
          down to the grid manually. */}
      <TVJellyseerrMovieSection
        title={t("search.request_movies")}
        items={movieResults}
        isFirstSection={false}
        onItemPress={onMoviePress}
      />
      <TVJellyseerrTvSection
        title={t("search.request_series")}
        items={tvResults}
        isFirstSection={false}
        onItemPress={onTvPress}
      />
      <TVJellyseerrPersonSection
        title={t("search.actors")}
        items={personResults}
        isFirstSection={false}
        onItemPress={onPersonPress}
      />
    </View>
  );
};
