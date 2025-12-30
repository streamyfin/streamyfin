import { Ionicons } from "@expo/vector-icons";
import { FlashList } from "@shopify/flash-list";
import { router, Stack } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toast } from "sonner-native";
import { Text } from "@/components/common/Text";
import { AlbumCard } from "@/components/music/AlbumCard";
import { ArtistCard } from "@/components/music/ArtistCard";
import type { Album, Artist } from "@/models/music/types";
import {
  clearAllAudioDownloads,
  getAllDownloadedAudioItems,
  getDownloadedAlbumsAsDomainModels,
  getDownloadedArtistsAsDomainModels,
  getPlayStats,
} from "@/providers/AudioPlayer/database";
import { useDownload } from "@/providers/DownloadProvider";

type ViewMode = "albums" | "artists";
type SortMode = "name" | "recent" | "mostPlayed" | "leastPlayed";

interface AlbumWithStats extends Album {
  playCount: number;
  lastPlayed?: Date;
  trackCount: number;
}

export default function OfflineMusicPage() {
  const insets = useSafeAreaInsets();
  const { downloadedItems, deleteFileByType, deleteFile } = useDownload();
  const [viewMode, setViewMode] = useState<ViewMode>("albums");
  const [sortMode, setSortMode] = useState<SortMode>("name");
  const [isLoading, setIsLoading] = useState(false);

  // Get play stats for all tracks - cached and only recomputed when items change
  const playStats = useMemo(() => getPlayStats(), [downloadedItems.length]);

  // Get albums directly from offline library (already has download info)
  const albumsData = useMemo(() => {
    const albums = getDownloadedAlbumsAsDomainModels();
    const audioTracks = getAllDownloadedAudioItems(); // Get tracks from AudioPlayer DB

    // Build album stats by aggregating track stats
    const albumStats: Record<
      string,
      { playCount: number; lastPlayed?: Date; trackCount: number }
    > = {};

    audioTracks.forEach((track) => {
      const albumId = track.item.AlbumId;
      if (!albumId) return;

      if (!albumStats[albumId]) {
        albumStats[albumId] = {
          playCount: 0,
          lastPlayed: undefined,
          trackCount: 0,
        };
      }

      albumStats[albumId].trackCount += 1;

      const trackStats = playStats[track.item.Id!];
      if (trackStats) {
        albumStats[albumId].playCount += trackStats.playCount;
        const trackLastPlayed = new Date(trackStats.lastPlayedDate);
        if (
          !albumStats[albumId].lastPlayed ||
          trackLastPlayed > albumStats[albumId].lastPlayed!
        ) {
          albumStats[albumId].lastPlayed = trackLastPlayed;
        }
      }
    });

    // Enrich albums with stats
    return albums.map(
      (album) =>
        ({
          ...album,
          playCount: albumStats[album.id]?.playCount || 0,
          lastPlayed: albumStats[album.id]?.lastPlayed,
          trackCount: albumStats[album.id]?.trackCount || album.trackCount || 0,
        }) as AlbumWithStats,
    );
  }, [downloadedItems.length, playStats]);

  // Sort albums based on sort mode
  const sortedAlbums = useMemo(() => {
    const sorted = [...albumsData];

    switch (sortMode) {
      case "name":
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "recent":
        sorted.sort((a, b) => {
          if (!a.lastPlayed && !b.lastPlayed)
            return a.name.localeCompare(b.name);
          if (!a.lastPlayed) return 1;
          if (!b.lastPlayed) return -1;
          const diff = b.lastPlayed.getTime() - a.lastPlayed.getTime();
          if (diff !== 0) return diff;
          return a.name.localeCompare(b.name); // Secondary sort by name
        });
        break;
      case "mostPlayed":
        sorted.sort((a, b) => {
          const diff = b.playCount - a.playCount;
          if (diff !== 0) return diff;
          return a.name.localeCompare(b.name); // Secondary sort by name
        });
        break;
      case "leastPlayed":
        sorted.sort((a, b) => {
          const diff = a.playCount - b.playCount;
          if (diff !== 0) return diff;
          return a.name.localeCompare(b.name); // Secondary sort by name
        });
        break;
    }

    return sorted;
  }, [albumsData, sortMode]);

  // Get artists directly from offline library
  const artistsData = useMemo(
    () =>
      getDownloadedArtistsAsDomainModels().sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    [downloadedItems.length],
  );

  const totalAlbums = albumsData.length;
  const totalTracks = useMemo(
    () => getAllDownloadedAudioItems().length,
    [downloadedItems.length],
  );

  // Handle sort mode change with loading indicator
  const handleSortModeChange = useCallback(
    (newSortMode: SortMode) => {
      if (newSortMode === sortMode) return;

      setIsLoading(true);
      // Defer the sort to next frame to allow loading indicator to show
      setTimeout(() => {
        setSortMode(newSortMode);
        setIsLoading(false);
      }, 0);
    },
    [sortMode],
  );

  const handleDeleteAll = useCallback(() => {
    Alert.alert(
      "Delete All Music",
      `Are you sure you want to delete all ${totalTracks} downloaded tracks?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              // Delete files from old database
              await deleteFileByType("Audio");
              // Clear new AudioPlayer database
              clearAllAudioDownloads();
              toast.success("All music deleted successfully");
            } catch (error) {
              console.error("Failed to delete music:", error);
              toast.error("Failed to delete music");
            }
          },
        },
      ],
    );
  }, [totalTracks, deleteFileByType]);

  const handleDeleteAlbum = useCallback(
    (album: AlbumWithStats) => {
      const albumTracks = downloadedItems.filter(
        (f) => f.item.Type === "Audio" && f.item.AlbumId === album.id,
      );

      Alert.alert(
        "Delete Album",
        `Delete "${album.name}" (${albumTracks.length} tracks)?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              try {
                // Delete all tracks from this album
                await Promise.all(
                  albumTracks.map((track) => deleteFile(track.item.Id!)),
                );
                toast.success(`Deleted ${album.name}`);
              } catch (error) {
                console.error("Failed to delete album:", error);
                toast.error("Failed to delete album");
              }
            },
          },
        ],
      );
    },
    [downloadedItems, deleteFile],
  );

  const formatLastPlayed = (date?: Date): string => {
    if (!date) return "Never played";
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
    return `${Math.floor(diffDays / 365)}y ago`;
  };

  const renderAlbumItem = useCallback(
    ({ item }: { item: AlbumWithStats }) => (
      <View style={styles.cardWrapper}>
        <AlbumCard
          album={item}
          size='medium'
          hideDownloadButton
          onPress={() => router.push(`/albums/${item.id}`)}
        />

        {/* Delete button overlay */}
        <TouchableOpacity
          onPress={() => handleDeleteAlbum(item)}
          style={styles.deleteButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <View style={styles.deleteButtonInner}>
            <Ionicons name='trash' size={16} color='white' />
          </View>
        </TouchableOpacity>

        {/* Play stats overlay */}
        {item.playCount > 0 && (
          <View style={styles.statsOverlay}>
            <View style={styles.playCountBadge}>
              <Ionicons name='play' size={10} color='white' />
              <Text style={styles.playCountText}>{item.playCount}</Text>
            </View>
          </View>
        )}

        {/* Last played info below card */}
        {sortMode === "recent" && (
          <Text style={styles.lastPlayedText}>
            {formatLastPlayed(item.lastPlayed)}
          </Text>
        )}
      </View>
    ),
    [handleDeleteAlbum, sortMode],
  );

  const renderArtistItem = useCallback(
    ({ item }: { item: Artist }) => (
      <ArtistCard
        artist={item}
        size='small'
        onPress={() => router.push(`/music/artist/${item.id}`)}
      />
    ),
    [],
  );

  if (totalTracks === 0) {
    return (
      <View style={styles.container}>
        <Stack.Screen
          options={{
            headerShown: true,
            title: "Offline Music",
            headerTransparent: false,
            headerStyle: { backgroundColor: "#121212" },
            headerTintColor: "white",
          }}
        />
        <View style={styles.emptyContainer}>
          <Ionicons name='musical-notes-outline' size={64} color='#6b7280' />
          <Text style={styles.emptyText}>
            Download some music to listen offline
          </Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.button}>
            <Text style={styles.buttonText}>Go Back</Text>
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
          title: "Offline Music",
          headerTransparent: false,
          headerStyle: { backgroundColor: "#121212" },
          headerTintColor: "white",
          headerRight: () => (
            <TouchableOpacity
              onPress={handleDeleteAll}
              style={styles.headerButton}
            >
              <Ionicons name='trash-outline' size={24} color='#ef4444' />
            </TouchableOpacity>
          ),
        }}
      />

      {/* Stats */}
      <View style={styles.statsContainer}>
        <Text style={styles.statsText}>
          {totalAlbums} {totalAlbums === 1 ? "album" : "albums"} • {totalTracks}{" "}
          {totalTracks === 1 ? "track" : "tracks"}
        </Text>
      </View>

      {/* View mode selector */}
      <View style={styles.selectorContainer}>
        <View style={styles.selector}>
          <TouchableOpacity
            onPress={() => setViewMode("albums")}
            style={[
              styles.selectorButton,
              viewMode === "albums" && styles.selectorButtonActive,
            ]}
          >
            <Text
              style={[
                styles.selectorButtonText,
                viewMode === "albums" && styles.selectorButtonTextActive,
              ]}
            >
              Albums
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setViewMode("artists")}
            style={[
              styles.selectorButton,
              viewMode === "artists" && styles.selectorButtonActive,
            ]}
          >
            <Text
              style={[
                styles.selectorButtonText,
                viewMode === "artists" && styles.selectorButtonTextActive,
              ]}
            >
              Artists
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Sort selector (only for albums view) */}
      {viewMode === "albums" && (
        <View style={styles.sortContainer}>
          <Text style={styles.sortLabel}>Sort by:</Text>
          <View style={styles.sortButtons}>
            <TouchableOpacity
              onPress={() => handleSortModeChange("name")}
              style={[
                styles.sortButton,
                sortMode === "name" && styles.sortButtonActive,
              ]}
              disabled={isLoading}
            >
              <Text
                style={[
                  styles.sortButtonText,
                  sortMode === "name" && styles.sortButtonTextActive,
                ]}
              >
                Name
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleSortModeChange("recent")}
              style={[
                styles.sortButton,
                sortMode === "recent" && styles.sortButtonActive,
              ]}
              disabled={isLoading}
            >
              <Text
                style={[
                  styles.sortButtonText,
                  sortMode === "recent" && styles.sortButtonTextActive,
                ]}
              >
                Recent
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleSortModeChange("mostPlayed")}
              style={[
                styles.sortButton,
                sortMode === "mostPlayed" && styles.sortButtonActive,
              ]}
              disabled={isLoading}
            >
              <Text
                style={[
                  styles.sortButtonText,
                  sortMode === "mostPlayed" && styles.sortButtonTextActive,
                ]}
              >
                Most Played
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleSortModeChange("leastPlayed")}
              style={[
                styles.sortButton,
                sortMode === "leastPlayed" && styles.sortButtonActive,
              ]}
              disabled={isLoading}
            >
              <Text
                style={[
                  styles.sortButtonText,
                  sortMode === "leastPlayed" && styles.sortButtonTextActive,
                ]}
              >
                Least Played
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Content */}
      <View style={styles.contentContainer}>
        {isLoading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size='large' color='#9333ea' />
            <Text style={styles.loadingText}>Sorting...</Text>
          </View>
        )}
        {viewMode === "albums" ? (
          <FlashList
            key='albums-list'
            data={sortedAlbums}
            renderItem={renderAlbumItem}
            keyExtractor={(item) => item.id}
            numColumns={2}
            contentContainerStyle={[
              styles.gridContent,
              { paddingBottom: insets.bottom + 100 },
            ]}
          />
        ) : (
          <FlashList
            key='artists-list'
            data={artistsData}
            renderItem={renderArtistItem}
            keyExtractor={(item) => item.id}
            numColumns={3}
            contentContainerStyle={[
              styles.gridContent,
              { paddingBottom: insets.bottom + 100 },
            ]}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0a",
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  emptyText: {
    fontSize: 16,
    color: "#9ca3af",
    marginTop: 16,
    textAlign: "center",
  },
  button: {
    marginTop: 24,
    backgroundColor: "#9333ea",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  headerButton: {
    paddingRight: 16,
  },
  statsContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  statsText: {
    fontSize: 14,
    color: "#9ca3af",
  },
  selectorContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
  },
  selector: {
    flexDirection: "row",
    backgroundColor: "#1c1c1e",
    borderRadius: 8,
    padding: 4,
  },
  selectorButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: "center",
  },
  selectorButtonActive: {
    backgroundColor: "#9333ea",
  },
  selectorButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#9ca3af",
  },
  selectorButtonTextActive: {
    color: "white",
  },
  sortContainer: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  sortLabel: {
    fontSize: 12,
    color: "#6b7280",
    marginBottom: 6,
  },
  sortButtons: {
    flexDirection: "row",
    gap: 6,
    flexWrap: "wrap",
  },
  sortButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "#1c1c1e",
  },
  sortButtonActive: {
    backgroundColor: "#9333ea",
  },
  sortButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#9ca3af",
  },
  sortButtonTextActive: {
    color: "white",
  },
  gridContent: {
    padding: 16,
  },
  cardWrapper: {
    position: "relative",
  },
  deleteButton: {
    position: "absolute",
    top: 8,
    left: 8,
    zIndex: 10,
  },
  deleteButtonInner: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(239, 68, 68, 0.9)",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  statsOverlay: {
    position: "absolute",
    bottom: 70,
    left: 8,
    zIndex: 5,
  },
  playCountBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(147, 51, 234, 0.9)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  playCountText: {
    fontSize: 11,
    fontWeight: "600",
    color: "white",
  },
  lastPlayedText: {
    fontSize: 11,
    color: "#6b7280",
    marginTop: 4,
    textAlign: "center",
  },
  contentContainer: {
    flex: 1,
    position: "relative",
  },
  loadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(10, 10, 10, 0.8)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: "#9ca3af",
    fontWeight: "600",
  },
});
