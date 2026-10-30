import type { BaseItemKind } from "@jellyfin/sdk/lib/generated-client";
import { getLibraryApi } from "@jellyfin/sdk/lib/utils/api";
import { t } from "i18next";
import { useAtom } from "jotai";
import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";
// PNG ASSET
import heart from "@/assets/icons/heart.fill.png";
import { Image } from "@/components/common/ServerImage";
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

export const Favorites = () => {
  const router = useRouter();
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  // Signing out clears the api, the user and the query cache while this tab
  // stays mounted: the rows wait for the next session instead of fetching.
  const hasSession = !!api && !!user?.Id;
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
      // The rows are disabled without a session. Should a fetch get here
      // anyway, throw: an empty page would be cached as a success and kept
      // into the next session.
      if (!api || !user?.Id) {
        throw new Error("Favorites requested without a session");
      }
      const response = await getLibraryApi(api).getItems({
        userId: user?.Id,
        sortBy: ["SeriesSortName", "SortName"],
        sortOrder: ["Ascending"],
        filters: ["IsFavorite"],
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
    [api, user],
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

  const handleSeeAllSeries = useCallback(() => {
    router.push({
      pathname: "/(auth)/(tabs)/(favorites)/see-all",
      params: { type: "Series", title: t("favorites.series") },
    } as any);
  }, [router]);

  const handleSeeAllMovies = useCallback(() => {
    router.push({
      pathname: "/(auth)/(tabs)/(favorites)/see-all",
      params: { type: "Movie", title: t("favorites.movies") },
    } as any);
  }, [router]);

  const handleSeeAllEpisodes = useCallback(() => {
    router.push({
      pathname: "/(auth)/(tabs)/(favorites)/see-all",
      params: { type: "Episode", title: t("favorites.episodes") },
    } as any);
  }, [router]);

  const handleSeeAllVideos = useCallback(() => {
    router.push({
      pathname: "/(auth)/(tabs)/(favorites)/see-all",
      params: { type: "Video", title: t("favorites.videos") },
    } as any);
  }, [router]);

  const handleSeeAllBoxsets = useCallback(() => {
    router.push({
      pathname: "/(auth)/(tabs)/(favorites)/see-all",
      params: { type: "BoxSet", title: t("favorites.boxsets") },
    } as any);
  }, [router]);

  const handleSeeAllPlaylists = useCallback(() => {
    router.push({
      pathname: "/(auth)/(tabs)/(favorites)/see-all",
      params: { type: "Playlist", title: t("favorites.playlists") },
    } as any);
  }, [router]);

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
            {t("favorites.noDataTitle")}
          </Text>
          <Text className='text-base text-white/70 text-center max-w-xs px-4'>
            {t("favorites.noData")}
          </Text>
        </View>
      )}
      <InfiniteScrollingCollectionList
        queryFn={fetchFavoriteSeries}
        queryKey={["home", "favorites", "series"]}
        title={t("favorites.series")}
        hideIfEmpty
        enabled={hasSession}
        pageSize={pageSize}
        onPressSeeAll={handleSeeAllSeries}
      />
      <InfiniteScrollingCollectionList
        queryFn={fetchFavoriteMovies}
        queryKey={["home", "favorites", "movies"]}
        title={t("favorites.movies")}
        hideIfEmpty
        enabled={hasSession}
        orientation='vertical'
        pageSize={pageSize}
        onPressSeeAll={handleSeeAllMovies}
      />
      <InfiniteScrollingCollectionList
        queryFn={fetchFavoriteEpisodes}
        queryKey={["home", "favorites", "episodes"]}
        title={t("favorites.episodes")}
        hideIfEmpty
        enabled={hasSession}
        pageSize={pageSize}
        onPressSeeAll={handleSeeAllEpisodes}
      />
      <InfiniteScrollingCollectionList
        queryFn={fetchFavoriteVideos}
        queryKey={["home", "favorites", "videos"]}
        title={t("favorites.videos")}
        hideIfEmpty
        enabled={hasSession}
        pageSize={pageSize}
        onPressSeeAll={handleSeeAllVideos}
      />
      <InfiniteScrollingCollectionList
        queryFn={fetchFavoriteBoxsets}
        queryKey={["home", "favorites", "boxsets"]}
        title={t("favorites.boxsets")}
        hideIfEmpty
        enabled={hasSession}
        pageSize={pageSize}
        onPressSeeAll={handleSeeAllBoxsets}
      />
      <InfiniteScrollingCollectionList
        queryFn={fetchFavoritePlaylists}
        queryKey={["home", "favorites", "playlists"]}
        title={t("favorites.playlists")}
        hideIfEmpty
        enabled={hasSession}
        pageSize={pageSize}
        onPressSeeAll={handleSeeAllPlaylists}
      />
    </View>
  );
};
