import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useAtom } from "jotai";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Input } from "@/components/common/Input";
import { Text } from "@/components/common/Text";
import { apiAtom } from "@/providers/JellyfinProvider";
import { getPrimaryImageUrl } from "@/utils/jellyfin/image/getPrimaryImageUrl";
import { TVSearchSection } from "./TVSearchSection";

const HORIZONTAL_PADDING = 60;
const TOP_PADDING = 100;
const SECTION_GAP = 10;
const SCALE_PADDING = 20;

// Loading skeleton for TV
const TVLoadingSkeleton: React.FC = () => {
  const itemWidth = 210;
  return (
    <View style={{ overflow: "visible" }}>
      <View
        style={{
          width: 200,
          height: 28,
          backgroundColor: "#262626",
          borderRadius: 8,
          marginBottom: 16,
          marginLeft: SCALE_PADDING,
        }}
      />
      <View
        style={{
          flexDirection: "row",
          gap: 16,
          paddingHorizontal: SCALE_PADDING,
          paddingVertical: SCALE_PADDING,
        }}
      >
        {[1, 2, 3, 4, 5].map((i) => (
          <View key={i} style={{ width: itemWidth }}>
            <View
              style={{
                backgroundColor: "#262626",
                width: itemWidth,
                aspectRatio: 10 / 15,
                borderRadius: 12,
                marginBottom: 8,
              }}
            />
            <View
              style={{
                borderRadius: 6,
                overflow: "hidden",
                marginBottom: 4,
                alignSelf: "flex-start",
              }}
            >
              <Text
                style={{
                  color: "#262626",
                  backgroundColor: "#262626",
                  borderRadius: 6,
                  fontSize: 16,
                }}
                numberOfLines={1}
              >
                Placeholder text here
              </Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
};

// Example search suggestions for TV
const exampleSearches = [
  "Lord of the rings",
  "Avengers",
  "Game of Thrones",
  "Breaking Bad",
  "Stranger Things",
  "The Mandalorian",
];

interface TVSearchPageProps {
  search: string;
  setSearch: (text: string) => void;
  debouncedSearch: string;
  movies?: BaseItemDto[];
  series?: BaseItemDto[];
  episodes?: BaseItemDto[];
  collections?: BaseItemDto[];
  actors?: BaseItemDto[];
  artists?: BaseItemDto[];
  albums?: BaseItemDto[];
  songs?: BaseItemDto[];
  playlists?: BaseItemDto[];
  loading: boolean;
  noResults: boolean;
  onItemPress: (item: BaseItemDto) => void;
}

export const TVSearchPage: React.FC<TVSearchPageProps> = ({
  search,
  setSearch,
  debouncedSearch,
  movies,
  series,
  episodes,
  collections,
  actors,
  artists,
  albums,
  songs,
  playlists,
  loading,
  noResults,
  onItemPress,
}) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [api] = useAtom(apiAtom);

  // Image URL getter for music items
  const getImageUrl = useMemo(() => {
    return (item: BaseItemDto): string | undefined => {
      if (!api) return undefined;
      const url = getPrimaryImageUrl({ api, item });
      return url ?? undefined;
    };
  }, [api]);

  // Determine which section should have initial focus
  const sections = useMemo(() => {
    const allSections: {
      key: string;
      title: string;
      items: BaseItemDto[] | undefined;
      orientation?: "horizontal" | "vertical";
    }[] = [
      { key: "movies", title: t("search.movies"), items: movies },
      { key: "series", title: t("search.series"), items: series },
      {
        key: "episodes",
        title: t("search.episodes"),
        items: episodes,
        orientation: "horizontal" as const,
      },
      {
        key: "collections",
        title: t("search.collections"),
        items: collections,
      },
      { key: "actors", title: t("search.actors"), items: actors },
      { key: "artists", title: t("search.artists"), items: artists },
      { key: "albums", title: t("search.albums"), items: albums },
      { key: "songs", title: t("search.songs"), items: songs },
      { key: "playlists", title: t("search.playlists"), items: playlists },
    ];

    return allSections.filter((s) => s.items && s.items.length > 0);
  }, [
    movies,
    series,
    episodes,
    collections,
    actors,
    artists,
    albums,
    songs,
    playlists,
    t,
  ]);

  return (
    <ScrollView
      nestedScrollEnabled
      showsVerticalScrollIndicator={false}
      keyboardDismissMode='on-drag'
      contentContainerStyle={{
        paddingTop: insets.top + TOP_PADDING,
        paddingBottom: insets.bottom + 60,
        paddingLeft: insets.left + HORIZONTAL_PADDING,
        paddingRight: insets.right + HORIZONTAL_PADDING,
      }}
    >
      {/* Search Input */}
      <View style={{ marginBottom: 32, marginHorizontal: SCALE_PADDING }}>
        <Input
          placeholder={t("search.search")}
          value={search}
          onChangeText={setSearch}
          keyboardType='default'
          returnKeyType='done'
          autoCapitalize='none'
          clearButtonMode='while-editing'
          maxLength={500}
          hasTVPreferredFocus={
            debouncedSearch.length === 0 && sections.length === 0
          }
        />
      </View>

      {/* Loading State */}
      {loading && (
        <View style={{ gap: SECTION_GAP }}>
          <TVLoadingSkeleton />
          <TVLoadingSkeleton />
        </View>
      )}

      {/* Search Results */}
      {!loading && (
        <View style={{ gap: SECTION_GAP }}>
          {sections.map((section, index) => (
            <TVSearchSection
              key={section.key}
              title={section.title}
              items={section.items!}
              orientation={section.orientation || "vertical"}
              isFirstSection={index === 0}
              onItemPress={onItemPress}
              imageUrlGetter={
                ["artists", "albums", "songs", "playlists"].includes(
                  section.key,
                )
                  ? getImageUrl
                  : undefined
              }
            />
          ))}
        </View>
      )}

      {/* No Results State */}
      {!loading && noResults && debouncedSearch.length > 0 && (
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
          <Text style={{ fontSize: 18, color: "#9334E9" }}>
            "{debouncedSearch}"
          </Text>
        </View>
      )}

      {/* Example Searches (when no search query) */}
      {!loading && debouncedSearch.length === 0 && (
        <View style={{ alignItems: "center", paddingTop: 40, gap: 16 }}>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 12,
              justifyContent: "center",
            }}
          >
            {exampleSearches.map((example) => (
              <Pressable
                key={example}
                onPress={() => setSearch(example)}
                style={({ focused }) => ({
                  paddingHorizontal: 20,
                  paddingVertical: 12,
                  borderRadius: 24,
                  backgroundColor: focused
                    ? "#9334E9"
                    : "rgba(255, 255, 255, 0.1)",
                  transform: [{ scale: focused ? 1.05 : 1 }],
                })}
              >
                <Text
                  style={{
                    fontSize: 16,
                    color: "#FFFFFF",
                  }}
                >
                  {example}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );
};
