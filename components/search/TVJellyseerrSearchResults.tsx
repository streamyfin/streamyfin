import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { useTranslation } from "react-i18next";
import { Animated, FlatList, Pressable, View } from "react-native";
import { Image } from "@/components/common/ServerImage";
import { Text } from "@/components/common/Text";
import { useTVFocusAnimation } from "@/components/tv/hooks/useTVFocusAnimation";
import { TVJellyseerrPosterCard } from "@/components/tv/TVJellyseerrPosterCard";
import { useScaledTVSizes } from "@/constants/TVSizes";
import { useScaledTVTypography } from "@/constants/TVTypography";
import { useJellyseerr } from "@/hooks/useJellyseerr";
import type {
  MovieResult,
  PersonResult,
  TvResult,
} from "@/utils/jellyseerr/server/models/Search";

const SCALE_PADDING = 20;

interface TVJellyseerrPersonPosterProps {
  item: PersonResult;
  onPress: () => void;
}

const TVJellyseerrPersonPoster: React.FC<TVJellyseerrPersonPosterProps> = ({
  item,
  onPress,
}) => {
  const typography = useScaledTVTypography();
  const { jellyseerrApi } = useJellyseerr();
  const { focused, handleFocus, handleBlur, animatedStyle } =
    useTVFocusAnimation();

  const posterUrl = item.profilePath
    ? jellyseerrApi?.imageProxy(item.profilePath, "w185")
    : null;

  return (
    <Pressable onPress={onPress} onFocus={handleFocus} onBlur={handleBlur}>
      <Animated.View
        style={[
          animatedStyle,
          {
            width: 160,
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
            width: 140,
            height: 140,
            borderRadius: 70,
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
              <Ionicons name='person' size={56} color='rgba(255,255,255,0.4)' />
            </View>
          )}
        </View>
        <Text
          style={{
            fontSize: typography.callout,
            color: focused ? "#fff" : "rgba(255,255,255,0.9)",
            fontWeight: "600",
            marginTop: 12,
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
        {title}
      </Text>
      <FlatList
        horizontal
        data={items}
        keyExtractor={(item) => item.id.toString()}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: sizes.padding.horizontal,
          paddingVertical: SCALE_PADDING,
          gap: 20,
        }}
        style={{ overflow: "visible" }}
        renderItem={({ item, index }) => (
          <TVJellyseerrPosterCard
            item={item}
            onPress={() => onItemPress(item)}
            hasTVPreferredFocus={isFirstSection && index === 0}
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
        {title}
      </Text>
      <FlatList
        horizontal
        data={items}
        keyExtractor={(item) => item.id.toString()}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: sizes.padding.horizontal,
          paddingVertical: SCALE_PADDING,
          gap: 20,
        }}
        style={{ overflow: "visible" }}
        renderItem={({ item, index }) => (
          <TVJellyseerrPosterCard
            item={item}
            onPress={() => onItemPress(item)}
            hasTVPreferredFocus={isFirstSection && index === 0}
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
        {title}
      </Text>
      <FlatList
        horizontal
        data={items}
        keyExtractor={(item) => item.id.toString()}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: sizes.padding.horizontal,
          paddingVertical: SCALE_PADDING,
          gap: 20,
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

  if (loading) {
    return null;
  }

  if (noResults && searchQuery.length > 0) {
    return (
      <View style={{ alignItems: "center", paddingTop: 40 }}>
        <Text
          style={{
            fontSize: 24,
            fontWeight: "bold",
            color: "#FFFFFF",
            marginBottom: 8,
          }}
        >
          {t("search.no_results_found_for")}
        </Text>
        <Text style={{ fontSize: 18, color: "rgba(255,255,255,0.6)" }}>
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
