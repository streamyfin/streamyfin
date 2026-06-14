import type { Api } from "@jellyfin/sdk";
import type {
  BaseItemKind,
  ItemFilter,
} from "@jellyfin/sdk/lib/generated-client";
import { getItemsApi } from "@jellyfin/sdk/lib/utils/api";
import { Image } from "expo-image";
import { t } from "i18next";
import { useAtom } from "jotai";
import { useCallback, useEffect, useState } from "react";
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
type EmptyState = Record<FavoriteTypes, boolean>;

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
    Series: false,
    Movie: false,
    Episode: false,
    Video: false,
    BoxSet: false,
    Playlist: false,
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
      const items = response.data.Items || [];

      // Update empty state for this specific type only for the first page
      if (startIndex === 0) {
        setEmptyState((prev) => ({
          ...prev,
          [itemType as FavoriteTypes]: items.length === 0,
        }));
      }

      return items;
    },
    [api, user, filter],
  );

  // Reset empty state when component mounts or dependencies change
  useEffect(() => {
    setEmptyState({
      Series: false,
      Movie: false,
      Episode: false,
      Video: false,
      BoxSet: false,
      Playlist: false,
    });
  }, [api, user]);

  // Check if all categories that have been loaded are empty
  const areAllEmpty = () => {
    const loadedCategories = Object.values(emptyState);
    return (
      loadedCategories.length > 0 &&
      loadedCategories.every((isEmpty) => isEmpty)
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
        onPressSeeAll={() => seeAll("Series", "Series")}
      />
      <InfiniteScrollingCollectionList
        queryFn={fetchFavoriteMovies}
        queryKey={["home", queryKeyBase, "movies"]}
        title={t("favorites.movies")}
        hideIfEmpty
        orientation='vertical'
        pageSize={pageSize}
        onPressSeeAll={() => seeAll("Movie", "Movies")}
      />
      <InfiniteScrollingCollectionList
        queryFn={fetchFavoriteEpisodes}
        queryKey={["home", queryKeyBase, "episodes"]}
        title={t("favorites.episodes")}
        hideIfEmpty
        pageSize={pageSize}
        onPressSeeAll={() => seeAll("Episode", "Episodes")}
      />
      <InfiniteScrollingCollectionList
        queryFn={fetchFavoriteVideos}
        queryKey={["home", queryKeyBase, "videos"]}
        title={t("favorites.videos")}
        hideIfEmpty
        pageSize={pageSize}
        onPressSeeAll={() => seeAll("Video", "Videos")}
      />
      <InfiniteScrollingCollectionList
        queryFn={fetchFavoriteBoxsets}
        queryKey={["home", queryKeyBase, "boxsets"]}
        title={t("favorites.boxsets")}
        hideIfEmpty
        pageSize={pageSize}
        onPressSeeAll={() => seeAll("BoxSet", "Boxsets")}
      />
      <InfiniteScrollingCollectionList
        queryFn={fetchFavoritePlaylists}
        queryKey={["home", queryKeyBase, "playlists"]}
        title={t("favorites.playlists")}
        hideIfEmpty
        pageSize={pageSize}
        onPressSeeAll={() => seeAll("Playlist", "Playlists")}
      />
    </View>
  );
};
