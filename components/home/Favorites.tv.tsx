import type { Api } from "@jellyfin/sdk";
import type {
  BaseItemKind,
  ItemFilter,
} from "@jellyfin/sdk/lib/generated-client";
import { getItemsApi } from "@jellyfin/sdk/lib/utils/api";
import { Image } from "expo-image";
import { useAtom } from "jotai";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import heart from "@/assets/icons/heart.fill.png";
import { Text } from "@/components/common/Text";
import { TVFavoritesTabBadges } from "@/components/favorites/TVFavoritesTabBadges";
import { InfiniteScrollingCollectionList } from "@/components/home/InfiniteScrollingCollectionList.tv";
import { Colors } from "@/constants/Colors";
import { useScaledTVTypography } from "@/constants/TVTypography";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";

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
type EmptyState = Record<FavoriteTypes, boolean>;

export const Favorites = () => {
  const typography = useScaledTVTypography();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const { settings } = useSettings();
  const pageSize = 20;

  // KefinTweaks watchlist (Likes-backed) view, toggled in-place like Discover.
  const watchlistEnabled = settings?.useKefinTweaks ?? false;
  const [viewType, setViewType] = useState<"Favorites" | "Watchlist">(
    "Favorites",
  );
  const filter: ItemFilter =
    watchlistEnabled && viewType === "Watchlist" ? "Likes" : "IsFavorite";
  const queryKeyBase =
    watchlistEnabled && viewType === "Watchlist" ? "watchlist" : "favorites";
  const emptyTitleKey = useMemo(
    () =>
      watchlistEnabled && viewType === "Watchlist"
        ? "favorites.noWatchlistTitle"
        : "favorites.noDataTitle",
    [watchlistEnabled, viewType],
  );
  const emptyTextKey = useMemo(
    () =>
      watchlistEnabled && viewType === "Watchlist"
        ? "favorites.noWatchlistData"
        : "favorites.noData",
    [watchlistEnabled, viewType],
  );

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

  useEffect(() => {
    setEmptyState({
      Series: false,
      Movie: false,
      Episode: false,
      Video: false,
      BoxSet: false,
      Playlist: false,
    });
  }, [api, user, viewType]);

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

  const tabBadges = (
    <TVFavoritesTabBadges
      viewType={viewType}
      setViewType={setViewType}
      enabled={watchlistEnabled}
      hasTVPreferredFocus={watchlistEnabled}
    />
  );

  if (areAllEmpty()) {
    return (
      <View
        style={{
          flex: 1,
          paddingTop: insets.top + TOP_PADDING,
          paddingHorizontal: HORIZONTAL_PADDING,
        }}
      >
        {tabBadges}
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Image
            style={{
              width: 64,
              height: 64,
              marginBottom: 16,
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
      </View>
    );
  }

  return (
    <ScrollView
      nestedScrollEnabled
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{
        paddingTop: insets.top + TOP_PADDING,
        paddingBottom: insets.bottom + 60,
      }}
    >
      <View style={{ gap: SECTION_GAP }}>
        {watchlistEnabled && (
          <View style={{ paddingHorizontal: HORIZONTAL_PADDING }}>
            {tabBadges}
          </View>
        )}
        <InfiniteScrollingCollectionList
          queryFn={fetchFavoriteSeries}
          queryKey={["home", queryKeyBase, "series"]}
          title={t("favorites.series")}
          hideIfEmpty
          pageSize={pageSize}
          isFirstSection={!watchlistEnabled}
        />
        <InfiniteScrollingCollectionList
          queryFn={fetchFavoriteMovies}
          queryKey={["home", queryKeyBase, "movies"]}
          title={t("favorites.movies")}
          hideIfEmpty
          orientation='vertical'
          pageSize={pageSize}
        />
        <InfiniteScrollingCollectionList
          queryFn={fetchFavoriteEpisodes}
          queryKey={["home", queryKeyBase, "episodes"]}
          title={t("favorites.episodes")}
          hideIfEmpty
          pageSize={pageSize}
        />
        <InfiniteScrollingCollectionList
          queryFn={fetchFavoriteVideos}
          queryKey={["home", queryKeyBase, "videos"]}
          title={t("favorites.videos")}
          hideIfEmpty
          pageSize={pageSize}
        />
        <InfiniteScrollingCollectionList
          queryFn={fetchFavoriteBoxsets}
          queryKey={["home", queryKeyBase, "boxsets"]}
          title={t("favorites.boxsets")}
          hideIfEmpty
          pageSize={pageSize}
        />
        <InfiniteScrollingCollectionList
          queryFn={fetchFavoritePlaylists}
          queryKey={["home", queryKeyBase, "playlists"]}
          title={t("favorites.playlists")}
          hideIfEmpty
          pageSize={pageSize}
        />
      </View>
    </ScrollView>
  );
};
