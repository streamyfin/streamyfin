import type { Api } from "@jellyfin/sdk";
import type {
  BaseItemKind,
  ItemFilter,
} from "@jellyfin/sdk/lib/generated-client";
import { getItemsApi } from "@jellyfin/sdk/lib/utils/api";
import { Image } from "expo-image";
import { t } from "i18next";
import { useAtom } from "jotai";
import { useCallback, useState } from "react";
import { Text, View } from "react-native";
// PNG ASSET
import heart from "@/assets/icons/heart.fill.png";
import { Colors } from "@/constants/Colors";
import useRouter from "@/hooks/useAppRouter";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { InfiniteScrollingCollectionList } from "./InfiniteScrollingCollectionList";

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
  /** Namespace for the see-all page headers ("favorites" or "kefintweaksWatchlist"). */
  seeAllNamespace?: "kefintweaksWatchlist" | "favorites";
}

export const Favorites = ({
  filter = "IsFavorite",
  queryKeyBase = "favorites",
  emptyTitleKey = "favorites.noDataTitle",
  emptyTextKey = "favorites.noData",
  seeAllNamespace = "favorites",
}: FavoritesProps = {}) => {
  const router = useRouter();
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const pageSize = 20;
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
  // (props swap in place, no remount) never flashes a stale empty state.
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

  // Navigate to the shared see-all screen. `name` is the capitalized type
  // suffix of the see-all header key (e.g. "Series" -> "seeAllSeries").
  // The namespace is branched explicitly so each t() call has a static prefix
  // (favorites.seeAll* / kefintweaksWatchlist.seeAll*) that the i18n usage
  // checker can detect — see scripts/check-i18n-keys.mjs. The `as any` is
  // needed because the route's custom params aren't part of expo-router's
  // typed Href.
  const seeAll = useCallback(
    (type: FavoriteTypes, name: string) => {
      const title =
        seeAllNamespace === "kefintweaksWatchlist"
          ? t(`kefintweaksWatchlist.seeAll${name}`)
          : t(`favorites.seeAll${name}`);
      router.push({
        pathname: "/(auth)/(tabs)/(favorites)/see-all",
        params: { type, title, filter },
      } as any);
    },
    [router, filter, seeAllNamespace],
  );

  return (
    <View className='flex flex-co gap-y-4'>
      {areAllEmpty() && (
        <View className='flex-1 items-center justify-center py-12'>
          <Image
            className={"w-10 h-10 mb-4"}
            style={{ tintColor: Colors.primary }}
            contentFit='contain'
            source={heart}
          />
          <Text className='text-xl font-semibold text-white mb-2'>
            {t(emptyTitleKey)}
          </Text>
          <Text className='text-base text-white/70 text-center max-w-xs px-4'>
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
        onEmptyStateChange={(isEmpty) => setTypeEmpty("Series", isEmpty)}
        onPressSeeAll={() => seeAll("Series", "Series")}
      />
      <InfiniteScrollingCollectionList
        queryFn={fetchFavoriteMovies}
        queryKey={["home", queryKeyBase, "movies"]}
        title={t("favorites.movies")}
        hideIfEmpty
        orientation='vertical'
        pageSize={pageSize}
        onEmptyStateChange={(isEmpty) => setTypeEmpty("Movie", isEmpty)}
        onPressSeeAll={() => seeAll("Movie", "Movies")}
      />
      <InfiniteScrollingCollectionList
        queryFn={fetchFavoriteEpisodes}
        queryKey={["home", queryKeyBase, "episodes"]}
        title={t("favorites.episodes")}
        hideIfEmpty
        pageSize={pageSize}
        onEmptyStateChange={(isEmpty) => setTypeEmpty("Episode", isEmpty)}
        onPressSeeAll={() => seeAll("Episode", "Episodes")}
      />
      <InfiniteScrollingCollectionList
        queryFn={fetchFavoriteVideos}
        queryKey={["home", queryKeyBase, "videos"]}
        title={t("favorites.videos")}
        hideIfEmpty
        pageSize={pageSize}
        onEmptyStateChange={(isEmpty) => setTypeEmpty("Video", isEmpty)}
        onPressSeeAll={() => seeAll("Video", "Videos")}
      />
      <InfiniteScrollingCollectionList
        queryFn={fetchFavoriteBoxsets}
        queryKey={["home", queryKeyBase, "boxsets"]}
        title={t("favorites.boxsets")}
        hideIfEmpty
        pageSize={pageSize}
        onEmptyStateChange={(isEmpty) => setTypeEmpty("BoxSet", isEmpty)}
        onPressSeeAll={() => seeAll("BoxSet", "Boxsets")}
      />
      <InfiniteScrollingCollectionList
        queryFn={fetchFavoritePlaylists}
        queryKey={["home", queryKeyBase, "playlists"]}
        title={t("favorites.playlists")}
        hideIfEmpty
        pageSize={pageSize}
        onEmptyStateChange={(isEmpty) => setTypeEmpty("Playlist", isEmpty)}
        onPressSeeAll={() => seeAll("Playlist", "Playlists")}
      />
    </View>
  );
};
