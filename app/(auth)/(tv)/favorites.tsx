import React, { useCallback, useMemo } from "react";
import { View, StyleSheet, FlatList } from "react-native";
import { useTranslation } from "react-i18next";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { BaseItemKind } from "@jellyfin/sdk/lib/generated-client";
import { TVScrollingCollectionList } from "@/components/home/TVScrollingCollectionList";
import { getItemsApi } from "@jellyfin/sdk/lib/utils/api";
import { useAtom } from "jotai";

// Define section type
type Section = {
  id: string;
  title: string;
  queryKey: string[];
  fetchFn: () => Promise<any>;
};

export default function TVFavoritesPage() {
  const { t } = useTranslation();
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);

  const fetchFavoritesByType = useCallback(
    async (itemType: BaseItemKind) => {
      if (!api || !user?.Id) {
        console.log(`No API or user ID available for ${itemType} favorites`);
        return [];
      }

      try {
        console.log(`Fetching ${itemType} favorites for user ${user.Id}`);
        const response = await getItemsApi(api).getItems({
          userId: user.Id,
          sortBy: ["SeriesSortName", "SortName"],
          sortOrder: ["Ascending"],
          filters: ["IsFavorite"],
          recursive: true,
          fields: [
            "Overview",
            "PrimaryImageAspectRatio",
            "ImageTags",
            "ImageBlurHashes",
            "ParentThumbImageTag",
            "ParentBackdropItemId",
            "ParentBackdropImageTags",
            "SeriesPrimaryImageTag",
            "SeriesThumbImageTag",
            "SeriesId",
            "BackdropImageTags",
          ],
          collapseBoxSetItems: false,
          excludeLocationTypes: ["Virtual"],
          enableTotalRecordCount: false,
          limit: 20,
          includeItemTypes: [itemType],
          imageTypeLimit: 3,
          enableImageTypes: ["Primary", "Backdrop", "Thumb"],
        });

        // Log the first item to help with debugging
        if (response.data.Items && response.data.Items.length > 0) {
          console.log(
            `Found ${response.data.Items.length} ${itemType} favorites`,
          );
          console.log(
            `First ${itemType} favorite item:`,
            JSON.stringify(
              {
                id: response.data.Items[0].Id,
                name: response.data.Items[0].Name,
                type: response.data.Items[0].Type,
                imageTags: response.data.Items[0].ImageTags,
              },
              null,
              2,
            ),
          );
        } else {
          console.log(`No ${itemType} favorites found`);
        }

        return response.data.Items || [];
      } catch (error) {
        console.error(`Error fetching ${itemType} favorites:`, error);
        return [];
      }
    },
    [api, user],
  );

  // Define all sections
  const sections = useMemo<Section[]>(
    () => [
      {
        id: "series",
        title: t("favorites.series"),
        queryKey: ["tv", "favorites", "series"],
        fetchFn: () => fetchFavoritesByType("Series"),
      },
      {
        id: "movies",
        title: t("favorites.movies"),
        queryKey: ["tv", "favorites", "movies"],
        fetchFn: () => fetchFavoritesByType("Movie"),
      },
      {
        id: "episodes",
        title: t("favorites.episodes"),
        queryKey: ["tv", "favorites", "episodes"],
        fetchFn: () => fetchFavoritesByType("Episode"),
      },
      {
        id: "videos",
        title: t("favorites.videos"),
        queryKey: ["tv", "favorites", "videos"],
        fetchFn: () => fetchFavoritesByType("Video"),
      },
      {
        id: "boxsets",
        title: t("favorites.boxsets"),
        queryKey: ["tv", "favorites", "boxsets"],
        fetchFn: () => fetchFavoritesByType("BoxSet"),
      },
      {
        id: "playlists",
        title: t("favorites.playlists"),
        queryKey: ["tv", "favorites", "playlists"],
        fetchFn: () => fetchFavoritesByType("Playlist"),
      },
    ],
    [t, fetchFavoritesByType],
  );

  const renderSection = useCallback(
    ({ item: section }: { item: Section }) => (
      <TVScrollingCollectionList
        key={section.id}
        queryFn={section.fetchFn}
        queryKey={section.queryKey}
        title={section.title}
        hideIfEmpty
        orientation="horizontal"
      />
    ),
    [],
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={sections}
        renderItem={renderSection}
        keyExtractor={(section) => section.id}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
  },
  contentContainer: {
    paddingVertical: 40,
  },
});
