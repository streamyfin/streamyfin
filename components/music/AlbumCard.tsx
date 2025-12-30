import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useAtomValue } from "jotai";
import { memo, useCallback, useMemo } from "react";
import { Pressable, StyleSheet, TouchableOpacity, View } from "react-native";
import { Text } from "@/components/common/Text";
import type { Album } from "@/models/music/types";
import { apiAtom } from "@/providers/JellyfinProvider";
import { DownloadButton } from "./DownloadButton";

interface AlbumCardProps {
  album: Album;
  /** Preset size option */
  size?: "small" | "medium" | "large";
  /** Override size with exact pixel value (takes precedence over size) */
  itemSize?: number;
  showArtist?: boolean;
  hideDownloadButton?: boolean;
  onPress?: () => void;
  onPlayPress?: () => void;
}

const SIZES = {
  small: 100,
  medium: 150,
  large: 180,
};

function AlbumCardComponent({
  album,
  size = "medium",
  itemSize,
  showArtist = true,
  hideDownloadButton = false,
  onPress,
  onPlayPress,
}: AlbumCardProps) {
  const api = useAtomValue(apiAtom);
  const cardSize = itemSize ?? SIZES[size];

  const artworkUrl = useMemo(() => {
    // Use domain model artwork if available
    if (album.artwork) return album.artwork;

    // Fallback to generating URL from jellyfinItem
    if (!api) return null;
    if (album.jellyfinItem.ImageTags?.Primary) {
      return `${api.basePath}/Items/${album.id}/Images/Primary?fillWidth=${cardSize * 2}&fillHeight=${cardSize * 2}&quality=90`;
    }
    return null;
  }, [api, album, cardSize]);

  const handlePress = useCallback(() => {
    if (onPress) {
      onPress();
    } else {
      router.push(`/albums/${album.id}`);
    }
  }, [album.id, onPress]);

  const handlePlayPress = useCallback(
    (e: any) => {
      e.stopPropagation();
      if (onPlayPress) {
        onPlayPress();
      }
    },
    [onPlayPress],
  );

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.container,
        { width: cardSize },
        pressed && styles.containerPressed,
      ]}
    >
      {/* Album artwork */}
      <View
        style={[styles.artworkContainer, { width: cardSize, height: cardSize }]}
      >
        {artworkUrl ? (
          <Image
            source={{ uri: artworkUrl }}
            style={styles.artwork}
            contentFit='cover'
            transition={200}
          />
        ) : (
          <View style={styles.artworkPlaceholder}>
            <Ionicons name='disc' size={cardSize / 3} color='#6b7280' />
          </View>
        )}

        {/* Download button overlay */}
        {!hideDownloadButton && (
          <View style={styles.downloadButton}>
            <DownloadButton
              item={album.jellyfinItem}
              type='album'
              size={24}
              color='white'
            />
          </View>
        )}

        {/* Play button overlay */}
        {onPlayPress && (
          <TouchableOpacity
            onPress={handlePlayPress}
            style={styles.playButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <View style={styles.playButtonInner}>
              <Ionicons name='play' size={20} color='black' />
            </View>
          </TouchableOpacity>
        )}
      </View>

      {/* Album info */}
      <View style={[styles.infoContainer, { width: cardSize }]}>
        <Text style={styles.title} numberOfLines={1}>
          {album.name}
        </Text>
        {showArtist && (
          <Text style={styles.artist} numberOfLines={1}>
            {album.artistName || "Unknown Artist"}
          </Text>
        )}
        {album.year && <Text style={styles.year}>{album.year}</Text>}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  containerPressed: {
    opacity: 0.8,
  },
  artworkContainer: {
    borderRadius: 8,
    overflow: "hidden",
    position: "relative",
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
  downloadButton: {
    position: "absolute",
    top: 8,
    right: 8,
  },
  playButton: {
    position: "absolute",
    bottom: 8,
    right: 8,
  },
  playButtonInner: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "white",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  infoContainer: {
    marginTop: 8,
  },
  title: {
    fontSize: 14,
    fontWeight: "600",
    color: "white",
  },
  artist: {
    fontSize: 12,
    color: "#9ca3af",
    marginTop: 2,
  },
  year: {
    fontSize: 11,
    color: "#6b7280",
    marginTop: 2,
  },
});

export const AlbumCard = memo(AlbumCardComponent);
