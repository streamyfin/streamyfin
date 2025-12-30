import { getFilterApi } from "@jellyfin/sdk/lib/utils/api";
import { FlashList } from "@shopify/flash-list";
import { useQuery } from "@tanstack/react-query";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useAtomValue } from "jotai";
import { useCallback } from "react";
import { StyleSheet, View } from "react-native";
import { Loader } from "@/components/Loader";
import { GenreCard } from "@/components/music/GenreCard";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";

interface Genre {
  name: string;
  count?: number;
}

export default function GenresListScreen() {
  const { libraryId } = useLocalSearchParams<{ libraryId: string }>();
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);

  const { data: genres, isLoading } = useQuery({
    queryKey: ["music-genres", libraryId],
    queryFn: async () => {
      if (!api || !user?.Id) return [];

      const response = await getFilterApi(api).getQueryFiltersLegacy({
        userId: user.Id,
        parentId: libraryId,
        includeItemTypes: ["MusicAlbum"],
      });

      const genreNames = response.data.Genres || [];
      return genreNames.map((g) => ({
        name: g,
        count: undefined, // Could fetch album count per genre if needed
      }));
    },
    enabled: !!api && !!user?.Id && !!libraryId,
  });

  const renderGenreItem = useCallback(
    ({ item }: { item: Genre }) => (
      <GenreCard
        genreName={item.name}
        itemCount={item.count}
        onPress={() =>
          router.push(
            `/(auth)/(tabs)/(home)/music/genre/${encodeURIComponent(item.name)}?libraryId=${libraryId}`,
          )
        }
      />
    ),
    [libraryId],
  );

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Stack.Screen
          options={{
            headerShown: true,
            title: "Genres",
            headerTransparent: false,
            headerStyle: { backgroundColor: "#121212" },
            headerTintColor: "white",
          }}
        />
        <View style={styles.loaderContainer}>
          <Loader />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: "Genres",
          headerTransparent: false,
          headerStyle: { backgroundColor: "#121212" },
          headerTintColor: "white",
        }}
      />

      <FlashList
        data={genres}
        renderItem={renderGenreItem}
        keyExtractor={(item) => item.name}
        numColumns={2}
        contentContainerStyle={styles.gridContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0a",
  },
  loaderContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  gridContent: {
    padding: 16,
    paddingBottom: 150, // Account for miniplayer + tab bar
  },
});
