import {
  getArtistsApi,
  getFilterApi,
  getItemsApi,
} from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useAtomValue } from "jotai";
import { StyleSheet, View } from "react-native";
import { Loader } from "@/components/Loader";
import { BrowseOption } from "@/components/music/BrowseOption";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useMusicApi } from "@/providers/MediaApiProvider";
import { useOfflineLibrary } from "@/providers/OfflineLibrary/OfflineLibraryProvider";

export default function MusicLibraryLanding() {
  const { libraryId } = useLocalSearchParams<{ libraryId: string }>();
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const musicApi = useMusicApi();
  const { offlineMode } = useOfflineLibrary();

  // Check if this is the offline music library
  const isOfflineLibrary = libraryId === "offline-music" || offlineMode;

  // Fetch counts for each browse option
  const { data: counts, isLoading } = useQuery({
    queryKey: ["music-counts", libraryId, isOfflineLibrary],
    queryFn: async () => {
      // Use the unified music API for offline mode
      if (isOfflineLibrary) {
        const [artistsResult, albumsResult] = await Promise.all([
          musicApi.getArtists({ limit: 0 }),
          musicApi.getAlbums({ limit: 0 }),
        ]);

        return {
          artists: artistsResult.totalCount,
          albums: albumsResult.totalCount,
          genres: 0, // Genres not supported offline yet
          playlists: 0, // Playlists not supported offline yet
        };
      }

      // Online mode - use Jellyfin APIs
      if (!api || !user?.Id) return null;

      const [artists, albums, genres, playlists] = await Promise.all([
        getArtistsApi(api).getArtists({
          userId: user.Id,
          parentId: libraryId,
          limit: 0,
        }),
        getItemsApi(api).getItems({
          userId: user.Id,
          parentId: libraryId,
          includeItemTypes: ["MusicAlbum"],
          limit: 0,
          recursive: true,
        }),
        getFilterApi(api).getQueryFiltersLegacy({
          userId: user.Id,
          parentId: libraryId,
          includeItemTypes: ["MusicAlbum"],
        }),
        getItemsApi(api).getItems({
          userId: user.Id,
          includeItemTypes: ["Playlist"],
          limit: 0,
          recursive: true,
        }),
      ]);

      return {
        artists: artists.data.TotalRecordCount || 0,
        albums: albums.data.TotalRecordCount || 0,
        genres: genres.data.Genres?.length || 0,
        playlists: playlists.data.TotalRecordCount || 0,
      };
    },
    enabled: isOfflineLibrary || (!!api && !!user?.Id && !!libraryId),
  });

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Stack.Screen
          options={{
            headerShown: true,
            title: "Music Library",
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
          title: "Music Library",
          headerTransparent: false,
          headerStyle: { backgroundColor: "#121212" },
          headerTintColor: "white",
        }}
      />

      <View style={styles.grid}>
        <View style={styles.row}>
          <BrowseOption
            title='Artists'
            description={`${counts?.artists || 0} artists`}
            icon='people'
            onPress={() =>
              router.push(
                `/(auth)/(tabs)/(libraries)/music/browse/artists?libraryId=${libraryId}`,
              )
            }
          />
          <View style={styles.gap} />
          <BrowseOption
            title='Albums'
            description={`${counts?.albums || 0} albums`}
            icon='disc'
            onPress={() =>
              router.push(
                `/(auth)/(tabs)/(libraries)/music/browse/albums?libraryId=${libraryId}`,
              )
            }
          />
        </View>

        <View style={styles.row}>
          <BrowseOption
            title='Genres'
            description={`${counts?.genres || 0} genres`}
            icon='musical-notes'
            onPress={() =>
              router.push(
                `/(auth)/(tabs)/(libraries)/music/browse/genres?libraryId=${libraryId}`,
              )
            }
          />
          <View style={styles.gap} />
          <BrowseOption
            title='Playlists'
            description={`${counts?.playlists || 0} playlists`}
            icon='list'
            onPress={() =>
              router.push(
                `/(auth)/(tabs)/(libraries)/music/browse/playlists?libraryId=${libraryId}`,
              )
            }
          />
        </View>
      </View>
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
  grid: {
    padding: 16,
    gap: 16,
  },
  row: {
    flexDirection: "row",
  },
  gap: {
    width: 16,
  },
});
