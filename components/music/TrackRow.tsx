import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { memo, useCallback, useMemo } from "react";
import { Pressable, StyleSheet, TouchableOpacity, View } from "react-native";
import { Text } from "@/components/common/Text";
import type { Song } from "@/models/music/types";
import { useAudioPlayer } from "@/providers/AudioPlayerProvider";
import { DownloadButton } from "./DownloadButton";
import { LikeButton } from "./LikeButton";

interface TrackRowProps {
  track: Song;
  index?: number;
  showAlbum?: boolean;
  showArtwork?: boolean;
  allTracks?: Song[];
  onPress?: () => void;
  isPlaying?: boolean;
  isActive?: boolean;
}

function formatDuration(ticks: number | null | undefined): string {
  if (!ticks) return "";
  const seconds = Math.floor(ticks / 10000000);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function TrackRowComponent({
  track,
  index,
  showAlbum = false,
  showArtwork = false,
  allTracks,
  onPress,
  isPlaying = false,
  isActive = false,
}: TrackRowProps) {
  const { playItems, state } = useAudioPlayer();

  const isCurrentlyPlaying = useMemo(() => {
    return state.currentTrack?.id === track.id;
  }, [state.currentTrack?.id, track.id]);

  const handlePress = useCallback(async () => {
    if (onPress) {
      onPress();
      return;
    }

    // If we have all tracks, play them all starting from this one
    if (allTracks && allTracks.length > 0) {
      const startIndex = allTracks.findIndex((t) => t.id === track.id);
      await playItems(allTracks, startIndex >= 0 ? startIndex : 0);
    } else {
      // Just play this single track
      await playItems([track], 0);
    }
  }, [track, allTracks, onPress, playItems]);

  const artworkUrl = useMemo(() => {
    if (!showArtwork) return null;
    return track.artwork || null;
  }, [track.artwork, showArtwork]);

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.container,
        pressed && styles.containerPressed,
        isCurrentlyPlaying && styles.containerActive,
      ]}
    >
      {/* Track number or playing indicator */}
      <View style={styles.indexContainer}>
        {isCurrentlyPlaying ? (
          <Ionicons
            name={state.isPlaying ? "musical-notes" : "pause"}
            size={16}
            color='#9333ea'
          />
        ) : index !== undefined ? (
          <Text style={styles.indexText}>{index}</Text>
        ) : null}
      </View>

      {/* Artwork (optional) */}
      {showArtwork && (
        <View style={styles.artworkContainer}>
          {artworkUrl ? (
            <Image
              source={{ uri: artworkUrl }}
              style={styles.artwork}
              contentFit='cover'
            />
          ) : (
            <View style={styles.artworkPlaceholder}>
              <Ionicons name='musical-note' size={20} color='#6b7280' />
            </View>
          )}
        </View>
      )}

      {/* Track info */}
      <View style={styles.infoContainer}>
        <Text
          style={[styles.title, isCurrentlyPlaying && styles.titleActive]}
          numberOfLines={1}
        >
          {track.title}
        </Text>
        <Text style={styles.artist} numberOfLines={1}>
          {track.artistName || "Unknown Artist"}
          {showAlbum && track.albumName && ` • ${track.albumName}`}
        </Text>
      </View>

      {/* Duration */}
      <Text style={styles.duration}>
        {track.duration ? formatDuration(track.duration * 10000000) : ""}
      </Text>

      {/* Like button */}
      <LikeButton
        item={track.jellyfinItem}
        size={20}
        color='#6b7280'
        activeColor='#ef4444'
      />

      {/* Download button */}
      <View style={styles.downloadButton}>
        <DownloadButton
          item={track.jellyfinItem}
          type='track'
          size={20}
          color='#6b7280'
        />
      </View>

      {/* More options button */}
      <TouchableOpacity
        style={styles.moreButton}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name='ellipsis-horizontal' size={20} color='#6b7280' />
      </TouchableOpacity>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  containerPressed: {
    backgroundColor: "rgba(255, 255, 255, 0.05)",
  },
  containerActive: {
    backgroundColor: "rgba(147, 51, 234, 0.1)",
  },
  indexContainer: {
    width: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  indexText: {
    fontSize: 14,
    color: "#6b7280",
  },
  artworkContainer: {
    width: 48,
    height: 48,
    borderRadius: 4,
    overflow: "hidden",
    marginLeft: 8,
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
  infoContainer: {
    flex: 1,
    marginLeft: 12,
    justifyContent: "center",
  },
  title: {
    fontSize: 15,
    color: "white",
    fontWeight: "500",
  },
  titleActive: {
    color: "#9333ea",
  },
  artist: {
    fontSize: 13,
    color: "#9ca3af",
    marginTop: 2,
  },
  duration: {
    fontSize: 13,
    color: "#6b7280",
    marginHorizontal: 12,
  },
  downloadButton: {
    marginHorizontal: 8,
  },
  moreButton: {
    padding: 8,
  },
});

export const TrackRow = memo(TrackRowComponent);
