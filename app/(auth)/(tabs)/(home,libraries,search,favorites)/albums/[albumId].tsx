import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo } from "react";
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
import { LikeButton } from "@/components/music/LikeButton";
import { TrackRow } from "@/components/music/TrackRow";
import { useAudioPlayer } from "@/providers/AudioPlayerProvider";
import { useMusicApi } from "@/providers/MediaApiProvider";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const ARTWORK_SIZE = SCREEN_WIDTH * 0.55;

function formatDuration(ticks: number | null | undefined): string {
  if (!ticks) return "";
  const totalSeconds = Math.floor(ticks / 10000000);
  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) {
    return `${hours} hr ${mins} min`;
  }
  return `${mins} min`;
}

export default function AlbumDetailScreen() {
  const { albumId } = useLocalSearchParams<{
    albumId: string;
  }>();
  const insets = useSafeAreaInsets();
  const { playItems } = useAudioPlayer();
  const musicApi = useMusicApi();

  // Fetch album details
  const { data: album, isLoading: albumLoading } = useQuery({
    queryKey: ["album", albumId],
    queryFn: async () => {
      if (!albumId) return null;
      return musicApi.getAlbum(albumId);
    },
    enabled: !!albumId,
    staleTime: 30000,
  });

  // Fetch album tracks (automatically enriched with download info)
  const { data: songs = [], isLoading: songsLoading } = useQuery({
    queryKey: ["album-songs", albumId],
    queryFn: async () => {
      if (!albumId) return [];
      return musicApi.getAlbumSongs(albumId);
    },
    enabled: !!albumId,
    staleTime: 30000,
  });

  // Calculate total duration
  const totalDuration = useMemo(() => {
    return (
      songs.reduce((sum, song) => sum + (song.duration || 0), 0) * 10000000
    ); // Convert seconds to ticks
  }, [songs]);

  // Get album artwork URL
  const artworkUrl = useMemo(() => {
    return album?.artwork || null;
  }, [album]);

  // Check if album is fully downloaded (all tracks offline)
  const isFullyOffline = useMemo(() => {
    if (songs.length === 0) return false;
    return songs.every((song) => song.source === "offline");
  }, [songs]);

  // Play all tracks
  const handlePlayAll = useCallback(async () => {
    if (songs.length === 0) return;
    await playItems(songs, 0);
  }, [songs, playItems]);

  // Shuffle play
  const handleShuffle = useCallback(async () => {
    if (songs.length === 0) return;
    const shuffled = [...songs].sort(() => Math.random() - 0.5);
    await playItems(shuffled, 0);
  }, [songs, playItems]);

  // Navigate to artist page
  const handleArtistPress = useCallback(() => {
    if (album?.artistId) {
      router.push(`/(auth)/music/artist/${album.artistId}`);
    }
  }, [album?.artistId]);

  // Navigate to genre page
  const handleGenrePress = useCallback((genre: string) => {
    router.push(
      `/(auth)/(tabs)/(home)/music/genre/${encodeURIComponent(genre)}`,
    );
  }, []);

  const isLoading = albumLoading || songsLoading;

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

  if (!album) {
    return (
      <View style={styles.container}>
        <Stack.Screen
          options={{
            headerShown: true,
            title: "Album",
            headerTransparent: false,
            headerStyle: { backgroundColor: "#121212" },
            headerTintColor: "white",
          }}
        />
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Album not found</Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
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
        {/* Header with artwork */}
        <View style={styles.header}>
          {artworkUrl && (
            <Image
              source={{ uri: artworkUrl }}
              style={StyleSheet.absoluteFill}
              contentFit='cover'
              blurRadius={30}
            />
          )}
          <LinearGradient
            colors={["rgba(10,10,10,0.3)", "rgba(10,10,10,1)"]}
            style={StyleSheet.absoluteFill}
          />

          <View style={[styles.headerContent, { paddingTop: insets.top + 60 }]}>
            {/* Album artwork */}
            <View style={styles.artworkContainer}>
              {artworkUrl ? (
                <Image
                  source={{ uri: artworkUrl }}
                  style={styles.artwork}
                  contentFit='cover'
                  transition={200}
                />
              ) : (
                <View style={styles.artworkPlaceholder}>
                  <Ionicons name='disc' size={80} color='#6b7280' />
                </View>
              )}
            </View>

            {/* Album info */}
            <View style={styles.titleRow}>
              <Text style={styles.albumTitle} numberOfLines={2}>
                {album.name || "Unknown Album"}
              </Text>
              <LikeButton item={album.jellyfinItem} size={28} />
            </View>
            <TouchableOpacity
              onPress={handleArtistPress}
              disabled={!album.artistId}
            >
              <Text
                style={[styles.albumArtist, album.artistId && styles.linkText]}
                numberOfLines={1}
              >
                {album.artistName || "Unknown Artist"}
              </Text>
            </TouchableOpacity>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
            >
              {isFullyOffline && (
                <Ionicons name='download' size={12} color='#9333ea' />
              )}
              <Text style={styles.albumMeta}>
                {album.year && `${album.year} • `}
                {songs.length} {songs.length === 1 ? "song" : "songs"}
                {totalDuration > 0 && ` • ${formatDuration(totalDuration)}`}
              </Text>
            </View>
            {/* Genre labels */}
            {album.genres && album.genres.length > 0 && (
              <View style={styles.genreContainer}>
                {album.genres.slice(0, 3).map((genre) => (
                  <TouchableOpacity
                    key={genre}
                    style={styles.genreChip}
                    onPress={() => handleGenrePress(genre)}
                  >
                    <Text style={styles.genreText}>{genre}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        </View>

        {/* Play buttons */}
        <View style={styles.playButtons}>
          <TouchableOpacity style={styles.playButton} onPress={handlePlayAll}>
            <Ionicons name='play' size={24} color='white' />
            <Text style={styles.playButtonText}>Play</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.shuffleButton}
            onPress={handleShuffle}
          >
            <Ionicons name='shuffle' size={24} color='white' />
            <Text style={styles.shuffleButtonText}>Shuffle</Text>
          </TouchableOpacity>
        </View>

        {/* Track list */}
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

        {songs.length === 0 && (
          <View style={styles.emptyContainer}>
            <Ionicons name='musical-notes-outline' size={48} color='#6b7280' />
            <Text style={styles.emptyText}>No tracks found</Text>
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
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
  },
  errorText: {
    fontSize: 18,
    color: "#9ca3af",
  },
  backButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: "#1c1c1e",
    borderRadius: 8,
  },
  backButtonText: {
    color: "white",
    fontSize: 16,
  },
  header: {
    position: "relative",
  },
  headerContent: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  artworkContainer: {
    width: ARTWORK_SIZE,
    height: ARTWORK_SIZE,
    borderRadius: 8,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 10,
    marginBottom: 20,
  },
  artwork: {
    width: "100%",
    height: "100%",
  },
  artworkPlaceholder: {
    width: "100%",
    height: "100%",
    backgroundColor: "#1c1c1e",
    justifyContent: "center",
    alignItems: "center",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  albumTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "white",
    textAlign: "center",
    flexShrink: 1,
  },
  albumArtist: {
    fontSize: 18,
    color: "#9ca3af",
    marginTop: 4,
    textAlign: "center",
  },
  linkText: {
    textDecorationLine: "underline",
  },
  albumMeta: {
    fontSize: 14,
    color: "#6b7280",
    marginTop: 8,
  },
  genreContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
    marginTop: 12,
  },
  genreChip: {
    backgroundColor: "rgba(147, 51, 234, 0.2)",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(147, 51, 234, 0.4)",
  },
  genreText: {
    fontSize: 12,
    color: "#a855f7",
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
  trackList: {
    flex: 1,
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 48,
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
    color: "#6b7280",
  },
});
