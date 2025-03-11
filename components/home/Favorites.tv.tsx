import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { getItemsApi } from "@jellyfin/sdk/lib/utils/api";
import { useAtom } from "jotai";
import { View, StyleSheet, Text } from "react-native";
import { useCallback } from "react";
import { BaseItemDto, BaseItemKind } from "@jellyfin/sdk/lib/generated-client";
import { t } from "i18next";
import { TVScrollingCollectionList } from "./TVScrollingCollectionList";

// TV-specific version of Favorites component that avoids nested VirtualizedLists
export const Favorites = () => {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);

  const fetchFavoritesByType = useCallback(
    async (itemType: BaseItemKind) => {
      const response = await getItemsApi(api!).getItems({
        userId: user?.Id!,
        sortBy: ["SeriesSortName", "SortName"],
        sortOrder: ["Ascending"],
        filters: ["IsFavorite"],
        recursive: true,
        fields: ["PrimaryImageAspectRatio"],
        collapseBoxSetItems: false,
        excludeLocationTypes: ["Virtual"],
        enableTotalRecordCount: false,
        limit: 20,
        includeItemTypes: [itemType],
      });
      return response.data.Items || [];
    },
    [api, user],
  );

  const fetchFavoriteSeries = useCallback(
    () => fetchFavoritesByType("Series"),
    [fetchFavoritesByType],
  );
  const fetchFavoriteMovies = useCallback(
    () => fetchFavoritesByType("Movie"),
    [fetchFavoritesByType],
  );
  const fetchFavoriteEpisodes = useCallback(
    () => fetchFavoritesByType("Episode"),
    [fetchFavoritesByType],
  );
  const fetchFavoriteVideos = useCallback(
    () => fetchFavoritesByType("Video"),
    [fetchFavoritesByType],
  );
  const fetchFavoriteBoxsets = useCallback(
    () => fetchFavoritesByType("BoxSet"),
    [fetchFavoritesByType],
  );
  const fetchFavoritePlaylists = useCallback(
    () => fetchFavoritesByType("Playlist"),
    [fetchFavoritesByType],
  );

  // Use individual components instead of nesting them in a ScrollView
  return (
    <View style={styles.container}>
      <TVScrollingCollectionList
        queryFn={fetchFavoriteSeries}
        queryKey={["home", "favorites", "series"]}
        title={t("favorites.series")}
        hideIfEmpty
      />
      <TVScrollingCollectionList
        queryFn={fetchFavoriteMovies}
        queryKey={["home", "favorites", "movies"]}
        title={t("favorites.movies")}
        hideIfEmpty
        orientation="vertical"
      />
      <TVScrollingCollectionList
        queryFn={fetchFavoriteEpisodes}
        queryKey={["home", "favorites", "episodes"]}
        title={t("favorites.episodes")}
        hideIfEmpty
      />
      <TVScrollingCollectionList
        queryFn={fetchFavoriteVideos}
        queryKey={["home", "favorites", "videos"]}
        title={t("favorites.videos")}
        hideIfEmpty
      />
      <TVScrollingCollectionList
        queryFn={fetchFavoriteBoxsets}
        queryKey={["home", "favorites", "boxsets"]}
        title={t("favorites.boxsets")}
        hideIfEmpty
      />
      <TVScrollingCollectionList
        queryFn={fetchFavoritePlaylists}
        queryKey={["home", "favorites", "playlists"]}
        title={t("favorites.playlists")}
        hideIfEmpty
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingBottom: 20,
  },
});
