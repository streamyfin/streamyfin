import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useAtom } from "jotai";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Input } from "@/components/common/Input";
import { Text } from "@/components/common/Text";
import { TVDiscover } from "@/components/jellyseerr/discover/TVDiscover";
import { useScaledTVTypography } from "@/constants/TVTypography";
import { apiAtom } from "@/providers/JellyfinProvider";
import { getPrimaryImageUrl } from "@/utils/jellyfin/image/getPrimaryImageUrl";
import type DiscoverSlider from "@/utils/jellyseerr/server/entity/DiscoverSlider";
import type {
  MovieResult,
  PersonResult,
  TvResult,
} from "@/utils/jellyseerr/server/models/Search";
import { TVJellyseerrSearchResults } from "./TVJellyseerrSearchResults";
import { TVSearchSection } from "./TVSearchSection";
import { TVSearchTabBadges } from "./TVSearchTabBadges";

const HORIZONTAL_PADDING = 60;
const TOP_PADDING = 100;
const SECTION_GAP = 10;
const SCALE_PADDING = 20;

// Loading skeleton for TV
const TVLoadingSkeleton: React.FC = () => {
  const typography = useScaledTVTypography();
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
                  fontSize: typography.callout,
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

type SearchType = "Library" | "Discover";

interface TVSearchPageProps {
  search: string;
  setSearch: (text: string) => void;
  debouncedSearch: string;
  // Library search results
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
  onItemLongPress?: (item: BaseItemDto) => void;
  // Jellyseerr/Discover props
  searchType: SearchType;
  setSearchType: (type: SearchType) => void;
  showDiscover: boolean;
  jellyseerrMovies?: MovieResult[];
  jellyseerrTv?: TvResult[];
  jellyseerrPersons?: PersonResult[];
  jellyseerrLoading?: boolean;
  jellyseerrNoResults?: boolean;
  onJellyseerrMoviePress?: (item: MovieResult) => void;
  onJellyseerrTvPress?: (item: TvResult) => void;
  onJellyseerrPersonPress?: (item: PersonResult) => void;
  // Discover sliders for empty state
  discoverSliders?: DiscoverSlider[];
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
  onItemLongPress,
  searchType,
  setSearchType,
  showDiscover,
  jellyseerrMovies = [],
  jellyseerrTv = [],
  jellyseerrPersons = [],
  jellyseerrLoading = false,
  jellyseerrNoResults = false,
  onJellyseerrMoviePress,
  onJellyseerrTvPress,
  onJellyseerrPersonPress,
  discoverSliders,
}) => {
  const typography = useScaledTVTypography();
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

  const isLibraryMode = searchType === "Library";
  const isDiscoverMode = searchType === "Discover";
  const currentLoading = isLibraryMode ? loading : jellyseerrLoading;
  const currentNoResults = isLibraryMode ? noResults : jellyseerrNoResults;

  return (
    <ScrollView
      nestedScrollEnabled
      showsVerticalScrollIndicator={false}
      keyboardDismissMode='on-drag'
      contentContainerStyle={{
        paddingTop: insets.top + TOP_PADDING,
        paddingBottom: insets.bottom + 60,
      }}
    >
      {/* Search Input */}
      <View
        style={{
          marginBottom: 24,
          marginHorizontal: HORIZONTAL_PADDING + 200,
        }}
      >
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
            debouncedSearch.length === 0 &&
            sections.length === 0 &&
            !showDiscover
          }
        />
      </View>

      {/* Search Type Tab Badges */}
      {showDiscover && (
        <View style={{ marginHorizontal: HORIZONTAL_PADDING }}>
          <TVSearchTabBadges
            searchType={searchType}
            setSearchType={setSearchType}
            showDiscover={showDiscover}
          />
        </View>
      )}

      {/* Loading State */}
      {currentLoading && (
        <View style={{ gap: SECTION_GAP }}>
          <TVLoadingSkeleton />
          <TVLoadingSkeleton />
        </View>
      )}

      {/* Library Search Results */}
      {isLibraryMode && !loading && (
        <View style={{ gap: SECTION_GAP }}>
          {sections.map((section, index) => (
            <TVSearchSection
              key={section.key}
              title={section.title}
              items={section.items!}
              orientation={section.orientation || "vertical"}
              isFirstSection={index === 0}
              onItemPress={onItemPress}
              onItemLongPress={onItemLongPress}
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

      {/* Jellyseerr/Discover Search Results */}
      {isDiscoverMode && !jellyseerrLoading && debouncedSearch.length > 0 && (
        <TVJellyseerrSearchResults
          movieResults={jellyseerrMovies}
          tvResults={jellyseerrTv}
          personResults={jellyseerrPersons}
          loading={jellyseerrLoading}
          noResults={jellyseerrNoResults}
          searchQuery={debouncedSearch}
          onMoviePress={onJellyseerrMoviePress || (() => {})}
          onTvPress={onJellyseerrTvPress || (() => {})}
          onPersonPress={onJellyseerrPersonPress || (() => {})}
        />
      )}

      {/* Discover Content (when no search query in Discover mode) */}
      {isDiscoverMode && !jellyseerrLoading && debouncedSearch.length === 0 && (
        <TVDiscover sliders={discoverSliders} />
      )}

      {/* No Results State */}
      {!currentLoading && currentNoResults && debouncedSearch.length > 0 && (
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
            style={{
              fontSize: typography.body,
              color: "rgba(255,255,255,0.6)",
            }}
          >
            "{debouncedSearch}"
          </Text>
        </View>
      )}
    </ScrollView>
  );
};
