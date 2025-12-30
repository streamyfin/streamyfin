import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useAtomValue } from "jotai";
import { memo, useCallback, useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/common/Text";
import type { Artist } from "@/models/music/types";
import { apiAtom } from "@/providers/JellyfinProvider";
import { DownloadButton } from "./DownloadButton";

interface ArtistCardProps {
  artist: Artist;
  /** Preset size option */
  size?: "small" | "medium" | "large";
  /** Override size with exact pixel value (takes precedence over size) */
  itemSize?: number;
  onPress?: () => void;
}

const SIZES = {
  small: 100,
  medium: 140,
  large: 180,
};

function ArtistCardComponent({
  artist,
  size = "medium",
  itemSize,
  onPress,
}: ArtistCardProps) {
  const api = useAtomValue(apiAtom);
  const cardSize = itemSize ?? SIZES[size];

  const artworkUrl = useMemo(() => {
    // Use domain model artwork if available
    if (artist.artwork) return artist.artwork;

    // Fallback to generating URL from jellyfinItem
    if (!api) return null;
    if (artist.jellyfinItem.ImageTags?.Primary) {
      return `${api.basePath}/Items/${artist.id}/Images/Primary?fillWidth=${cardSize * 2}&fillHeight=${cardSize * 2}&quality=90`;
    }
    return null;
  }, [api, artist, cardSize]);

  const handlePress = useCallback(() => {
    if (onPress) {
      onPress();
    } else {
      router.push(`/(auth)/music/artist/${artist.id}`);
    }
  }, [artist.id, onPress]);

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.container,
        { width: cardSize },
        pressed && styles.containerPressed,
      ]}
    >
      {/* Artist image wrapper with download button */}
      <View style={{ position: "relative" }}>
        {/* Artist image (square with rounded corners) */}
        <View
          style={[styles.imageContainer, { width: cardSize, height: cardSize }]}
        >
          {artworkUrl ? (
            <Image
              source={{ uri: artworkUrl }}
              style={styles.image}
              contentFit='cover'
              transition={200}
            />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Ionicons name='person' size={cardSize / 3} color='#6b7280' />
            </View>
          )}
        </View>

        {/* Download button overlay */}
        <View
          style={[
            styles.downloadButton,
            {
              width: cardSize,
              height: cardSize,
            },
          ]}
        >
          <DownloadButton
            item={artist.jellyfinItem}
            type='artist'
            size={20}
            color='white'
            showProgress={false}
          />
        </View>
      </View>

      {/* Artist name */}
      <View style={[styles.infoContainer, { width: cardSize }]}>
        <Text style={styles.name} numberOfLines={2}>
          {artist.name}
        </Text>
        <Text style={styles.type}>Artist</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    marginBottom: 16,
  },
  containerPressed: {
    opacity: 0.8,
  },
  imageContainer: {
    borderRadius: 8,
    overflow: "hidden",
    position: "relative",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  downloadButton: {
    position: "absolute",
    top: 0,
    right: 0,
    justifyContent: "flex-start",
    alignItems: "flex-end",
    padding: 4,
    pointerEvents: "box-none",
  },
  imagePlaceholder: {
    width: "100%",
    height: "100%",
    backgroundColor: "#1c1c1e",
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 8,
  },
  infoContainer: {
    marginTop: 8,
    alignItems: "center",
  },
  name: {
    fontSize: 14,
    fontWeight: "600",
    color: "white",
    textAlign: "center",
  },
  type: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 2,
  },
});

export const ArtistCard = memo(ArtistCardComponent);
