import { Ionicons } from "@expo/vector-icons";
import { FlashList } from "@shopify/flash-list";
import { useQuery } from "@tanstack/react-query";
import { Stack, useLocalSearchParams } from "expo-router";
import { useCallback } from "react";
import {
  Dimensions,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/common/Text";
import { Loader } from "@/components/Loader";
import { AlbumCard } from "@/components/music/AlbumCard";
import { ArtistCard } from "@/components/music/ArtistCard";
import { LikeButton } from "@/components/music/LikeButton";
import { TrackRow } from "@/components/music/TrackRow";
import type { Album } from "@/models/music/types";
import { useAudioPlayer } from "@/providers/AudioPlayerProvider";
import { useMusicApi } from "@/providers/MediaApiProvider";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export default function ArtistDetailScreen() {
  const { artistId } = useLocalSearchParams<{ artistId: string }>();
  const insets = useSafeAreaInsets();
  const { playItems } = useAudioPlayer();
  const musicApi = useMusicApi();

  // Artist info
  const { data: artist, isLoading: artistLoading } = useQuery({
    queryKey: ["artist", artistId],
    queryFn: async () => {
      if (!artistId) return null;
      return musicApi.getArtist(artistId);
    },
    enabled: !!artistId,
    staleTime: 30000,
  });

  // Top tracks (using getSongs with artist filter sorted by PlayCount)
  const { data: songs = [], isLoading: tracksLoading } = useQuery({
    queryKey: ["artist-top-tracks", artistId],
    queryFn: async () => {
      if (!artistId) return [];
      // Use getSongs with artistId filter
      const result = await musicApi.getSongs({
        artistId,
        sortBy: ["PlayCount"],
        sortOrder: "Descending",
        limit: 10,
      });
      return result.items;
    },
    enabled: !!artistId,
    staleTime: 30000,
  });

  // Albums
  const { data: albums = [], isLoading: albumsLoading } = useQuery({
    queryKey: ["artist-albums", artistId],
    queryFn: async () => {
      if (!artistId) return [];
      return musicApi.getArtistAlbums(artistId, {
        sortBy: ["ProductionYear"],
        sortOrder: "Descending",
      });
    },
    enabled: !!artistId,
    staleTime: 30000,
  });

  const handlePlayAll = useCallback(async () => {
    if (songs.length === 0) return;
    await playItems(songs, 0);
  }, [songs, playItems]);

  const handleShuffle = useCallback(async () => {
    if (songs.length === 0) return;
    const shuffled = [...songs].sort(() => Math.random() - 0.5);
    await playItems(shuffled, 0);
  }, [songs, playItems]);

  const renderAlbumItem = useCallback(
    ({ item }: { item: Album }) => <AlbumCard album={item} size='medium' />,
    [],
  );

  const isLoading = artistLoading || tracksLoading || albumsLoading;

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Stack.Screen
          options={{
            headerShown: true,
            title: "Loading...",
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

  if (!artist) {
    return (
      <View style={styles.container}>
        <Stack.Screen
          options={{
            headerShown: true,
            title: "Artist",
            headerTransparent: false,
            headerStyle: { backgroundColor: "#121212" },
            headerTintColor: "white",
          }}
        />
        <View style={styles.loaderContainer}>
          <Text style={styles.errorText}>Artist not found</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: "",
          headerTransparent: true,
          headerTintColor: "white",
        }}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
      >
        {/* Artist header */}
        <View style={[styles.header, { paddingTop: insets.top + 60 }]}>
          {artist && <ArtistCard artist={artist} size='large' />}
          <View style={styles.metadata}>
            <View style={styles.metaRow}>
              {albums.length > 0 && (
                <Text style={styles.metaText}>
                  {albums.length} {albums.length === 1 ? "album" : "albums"}
                </Text>
              )}
              {artist && <LikeButton item={artist.jellyfinItem} size={28} />}
            </View>
          </View>
        </View>

        {/* Play buttons */}
        {songs.length > 0 && (
          <View style={styles.playButtons}>
            <TouchableOpacity style={styles.playButton} onPress={handlePlayAll}>
              <Ionicons name='play' size={24} color='white' />
              <Text style={styles.playButtonText}>Play All</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.shuffleButton}
              onPress={handleShuffle}
            >
              <Ionicons name='shuffle' size={24} color='white' />
              <Text style={styles.shuffleButtonText}>Shuffle</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Top tracks section */}
        {songs.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Popular Tracks</Text>
            <View style={styles.trackList}>
              {songs.map((song, index) => (
                <TrackRow
                  key={song.id}
                  track={song}
                  index={song.trackNumber || index + 1}
                  allTracks={songs}
                />
              ))}
            </View>
          </View>
        )}

        {/* Albums section */}
        {albums.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Albums</Text>
            <FlashList
              data={albums}
              renderItem={renderAlbumItem}
              keyExtractor={(item) => item.id}
              numColumns={2}
              scrollEnabled={false}
              contentContainerStyle={styles.albumsGrid}
            />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0a",
  },
  scrollView: {
    flex: 1,
  },
  loaderContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  metadata: {
    marginTop: 16,
    alignItems: "center",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  metaText: {
    fontSize: 14,
    color: "#9ca3af",
  },
  playButtons: {
    flexDirection: "row",
    paddingHorizontal: 24,
    gap: 12,
    marginBottom: 24,
  },
  playButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#9333ea",
    paddingVertical: 14,
    borderRadius: 8,
    gap: 8,
  },
  playButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "white",
  },
  shuffleButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1c1c1e",
    paddingVertical: 14,
    borderRadius: 8,
    gap: 8,
  },
  shuffleButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "white",
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "white",
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  trackList: {
    paddingHorizontal: 0,
  },
  albumsGrid: {
    paddingHorizontal: 16,
  },
  errorText: {
    fontSize: 18,
    color: "#9ca3af",
  },
});
