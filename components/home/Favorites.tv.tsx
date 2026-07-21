import type { Api } from "@jellyfin/sdk";
import type {
  BaseItemKind,
  ItemFilter,
} from "@jellyfin/sdk/lib/generated-client";
import { getItemsApi } from "@jellyfin/sdk/lib/utils/api";
import { Image } from "expo-image";
import { useAtom } from "jotai";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import heart from "@/assets/icons/heart.fill.png";
import { Text } from "@/components/common/Text";
import { InfiniteScrollingCollectionList } from "@/components/home/InfiniteScrollingCollectionList.tv";
import { Colors } from "@/constants/Colors";
import { useScaledTVTypography } from "@/constants/TVTypography";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { scaleSize } from "@/utils/scaleSize";

const HORIZONTAL_PADDING = 60;
const TOP_PADDING = 100;
const SECTION_GAP = 10;

type FavoriteTypes =
  | "Series"
  | "Movie"
  | "Episode"
  | "Video"
  | "BoxSet"
  | "Playlist";
// `null` = not settled yet (loading/unknown); avoids flashing the empty
// message during a favorites/watchlist switch before the new queries resolve.
type EmptyState = Record<FavoriteTypes, boolean | null>;

interface FavoritesProps {
  /** Jellyfin item filter. "IsFavorite" (default) or "Likes" for the watchlist view. */
  filter?: ItemFilter;
  /** Query key segment used to keep favorites/watchlist caches separate. */
  queryKeyBase?: string;
  emptyTitleKey?: string;
  emptyTextKey?: string;
  /** false when a toggle sits above these lists (so the toggle takes first focus). */
  isFirstSection?: boolean;
  /** Overrides the default nav-bar clearance; used when a toggle already clears it. */
  contentTopPadding?: number;
}

export const Favorites = ({
  filter = "IsFavorite",
  queryKeyBase = "favorites",
  emptyTitleKey = "favorites.noDataTitle",
  emptyTextKey = "favorites.noData",
  isFirstSection = true,
  contentTopPadding,
}: FavoritesProps = {}) => {
  const typography = useScaledTVTypography();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const pageSize = 20;

  const topPadding = contentTopPadding ?? insets.top + TOP_PADDING;

  const [emptyState, setEmptyState] = useState<EmptyState>({
    Series: null,
    Movie: null,
    Episode: null,
    Video: null,
    BoxSet: null,
    Playlist: null,
  });

  const fetchFavoritesByType = useCallback(
    async (
      itemType: BaseItemKind,
      startIndex: number = 0,
      limit: number = 20,
    ) => {
      const response = await getItemsApi(api as Api).getItems({
        userId: user?.Id,
        sortBy: ["SeriesSortName", "SortName"],
        sortOrder: ["Ascending"],
        filters: [filter],
        recursive: true,
        fields: ["PrimaryImageAspectRatio"],
        collapseBoxSetItems: false,
        excludeLocationTypes: ["Virtual"],
        enableTotalRecordCount: false,
        startIndex: startIndex,
        limit: limit,
        includeItemTypes: [itemType],
      });
      return response.data.Items || [];
    },
    [api, user, filter],
  );

  // Emptiness is reported by each list once its query settles (incl. cache
  // hits), so it stays correct where a queryFn side effect would go stale.
  const setTypeEmpty = useCallback(
    (type: FavoriteTypes, isEmpty: boolean | null) =>
      setEmptyState((prev) =>
        prev[type] === isEmpty ? prev : { ...prev, [type]: isEmpty },
      ),
    [],
  );

  // Show the empty message only once every category has settled AND is empty.
  // A `null` (still loading) keeps it hidden, so switching favorites/watchlist
  // never flashes a stale empty state.
  const areAllEmpty = () => {
    const categories = Object.values(emptyState);
    return (
      categories.length > 0 && categories.every((isEmpty) => isEmpty === true)
    );
  };

  const fetchFavoriteSeries = useCallback(
    ({ pageParam }: { pageParam: number }) =>
      fetchFavoritesByType("Series", pageParam, pageSize),
    [fetchFavoritesByType, pageSize],
  );
  const fetchFavoriteMovies = useCallback(
    ({ pageParam }: { pageParam: number }) =>
      fetchFavoritesByType("Movie", pageParam, pageSize),
    [fetchFavoritesByType, pageSize],
  );
  const fetchFavoriteEpisodes = useCallback(
    ({ pageParam }: { pageParam: number }) =>
      fetchFavoritesByType("Episode", pageParam, pageSize),
    [fetchFavoritesByType, pageSize],
  );
  const fetchFavoriteVideos = useCallback(
    ({ pageParam }: { pageParam: number }) =>
      fetchFavoritesByType("Video", pageParam, pageSize),
    [fetchFavoritesByType, pageSize],
  );
  const fetchFavoriteBoxsets = useCallback(
    ({ pageParam }: { pageParam: number }) =>
      fetchFavoritesByType("BoxSet", pageParam, pageSize),
    [fetchFavoritesByType, pageSize],
  );
  const fetchFavoritePlaylists = useCallback(
    ({ pageParam }: { pageParam: number }) =>
      fetchFavoritesByType("Playlist", pageParam, pageSize),
    [fetchFavoritesByType, pageSize],
  );

  return (
    <ScrollView
      nestedScrollEnabled
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{
        paddingTop: topPadding,
        paddingBottom: insets.bottom + 60,
        flexGrow: 1,
      }}
    >
      <View style={{ gap: SECTION_GAP, flex: 1 }}>
        {/* Rendered alongside the lists (never instead of them) so they stay
            mounted and re-report emptiness on a favorites/watchlist switch;
            an early return here would freeze the all-empty state. */}
        {areAllEmpty() && (
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: HORIZONTAL_PADDING,
            }}
          >
            <Image
              style={{
                width: scaleSize(64),
                height: scaleSize(64),
                marginBottom: scaleSize(16),
                tintColor: Colors.primary,
              }}
              contentFit='contain'
              source={heart}
            />
            <Text
              style={{
                fontSize: typography.heading,
                fontWeight: "bold",
                marginBottom: 8,
                color: "#FFFFFF",
              }}
            >
              {t(emptyTitleKey)}
            </Text>
            <Text
              style={{
                textAlign: "center",
                opacity: 0.7,
                fontSize: typography.body,
                color: "#FFFFFF",
              }}
            >
              {t(emptyTextKey)}
            </Text>
          </View>
        )}
        <InfiniteScrollingCollectionList
          queryFn={fetchFavoriteSeries}
          queryKey={["home", queryKeyBase, "series"]}
          title={t("favorites.series")}
          hideIfEmpty
          pageSize={pageSize}
          isFirstSection={isFirstSection}
          onEmptyStateChange={(isEmpty) => setTypeEmpty("Series", isEmpty)}
        />
        <InfiniteScrollingCollectionList
          queryFn={fetchFavoriteMovies}
          queryKey={["home", queryKeyBase, "movies"]}
          title={t("favorites.movies")}
          hideIfEmpty
          orientation='vertical'
          pageSize={pageSize}
          onEmptyStateChange={(isEmpty) => setTypeEmpty("Movie", isEmpty)}
        />
        <InfiniteScrollingCollectionList
          queryFn={fetchFavoriteEpisodes}
          queryKey={["home", queryKeyBase, "episodes"]}
          title={t("favorites.episodes")}
          hideIfEmpty
          pageSize={pageSize}
          onEmptyStateChange={(isEmpty) => setTypeEmpty("Episode", isEmpty)}
        />
        <InfiniteScrollingCollectionList
          queryFn={fetchFavoriteVideos}
          queryKey={["home", queryKeyBase, "videos"]}
          title={t("favorites.videos")}
          hideIfEmpty
          pageSize={pageSize}
          onEmptyStateChange={(isEmpty) => setTypeEmpty("Video", isEmpty)}
        />
        <InfiniteScrollingCollectionList
          queryFn={fetchFavoriteBoxsets}
          queryKey={["home", queryKeyBase, "boxsets"]}
          title={t("favorites.boxsets")}
          hideIfEmpty
          pageSize={pageSize}
          onEmptyStateChange={(isEmpty) => setTypeEmpty("BoxSet", isEmpty)}
        />
        <InfiniteScrollingCollectionList
          queryFn={fetchFavoritePlaylists}
          queryKey={["home", queryKeyBase, "playlists"]}
          title={t("favorites.playlists")}
          hideIfEmpty
          pageSize={pageSize}
          onEmptyStateChange={(isEmpty) => setTypeEmpty("Playlist", isEmpty)}
        />
      </View>
    </ScrollView>
  );
};
