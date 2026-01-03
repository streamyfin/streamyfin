import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useAtom } from "jotai";
import React, { useCallback, useMemo } from "react";
import { Platform, StyleSheet, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/common/Text";
import { apiAtom } from "@/providers/JellyfinProvider";
import { useMusicPlayer } from "@/providers/MusicPlayerProvider";

const HORIZONTAL_MARGIN = Platform.OS === "android" ? 8 : 16;
const BOTTOM_TAB_HEIGHT = Platform.OS === "android" ? 56 : 52;
const BAR_HEIGHT = Platform.OS === "android" ? 58 : 50;

export const MiniPlayerBar: React.FC = () => {
  const [api] = useAtom(apiAtom);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { currentTrack, isPlaying, progress, duration, togglePlayPause, next } =
    useMusicPlayer();

  const imageUrl = useMemo(() => {
    if (!api || !currentTrack) return null;
    const albumId = currentTrack.AlbumId || currentTrack.ParentId;
    if (albumId) {
      return `${api.basePath}/Items/${albumId}/Images/Primary?maxHeight=100&maxWidth=100`;
    }
    return `${api.basePath}/Items/${currentTrack.Id}/Images/Primary?maxHeight=100&maxWidth=100`;
  }, [api, currentTrack]);

  const _progressPercentage = useMemo(() => {
    if (!duration || duration === 0) return 0;
    return (progress / duration) * 100;
  }, [progress, duration]);

  const handlePress = useCallback(() => {
    router.push("/(auth)/now-playing");
  }, [router]);

  const handlePlayPause = useCallback(
    (e: any) => {
      e.stopPropagation();
      togglePlayPause();
    },
    [togglePlayPause],
  );

  const handleNext = useCallback(
    (e: any) => {
      e.stopPropagation();
      next();
    },
    [next],
  );

  if (!currentTrack) return null;

  const content = (
    <>
      {/* Album art */}
      <View style={styles.albumArt}>
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={styles.albumImage}
            contentFit='cover'
            cachePolicy='memory-disk'
          />
        ) : (
          <View style={styles.albumPlaceholder}>
            <Ionicons name='musical-note' size={20} color='#888' />
          </View>
        )}
      </View>

      {/* Track info */}
      <View style={styles.trackInfo}>
        <Text numberOfLines={1} style={styles.trackTitle}>
          {currentTrack.Name}
        </Text>
        <Text numberOfLines={1} style={styles.artistName}>
          {currentTrack.Artists?.join(", ") || currentTrack.AlbumArtist}
        </Text>
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        <TouchableOpacity
          onPress={handlePlayPause}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.controlButton}
        >
          <Ionicons
            name={isPlaying ? "pause" : "play"}
            size={26}
            color='white'
          />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleNext}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.controlButton}
        >
          <Ionicons name='play-forward' size={22} color='white' />
        </TouchableOpacity>
      </View>

      {/* Progress bar at bottom */}
      {/* <View style={styles.progressContainer}>
        <View
          style={[styles.progressFill, { width: `${progressPercentage}%` }]}
        />
      </View> */}
    </>
  );

  return (
    <View
      style={[
        styles.container,
        {
          bottom:
            BOTTOM_TAB_HEIGHT +
            insets.bottom +
            (Platform.OS === "android" ? 32 : 4),
        },
      ]}
    >
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.9}
        style={styles.touchable}
      >
        {Platform.OS === "ios" ? (
          <BlurView intensity={80} tint='dark' style={styles.blurContainer}>
            {content}
          </BlurView>
        ) : (
          <View style={styles.androidContainer}>{content}</View>
        )}
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: HORIZONTAL_MARGIN,
    right: HORIZONTAL_MARGIN,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  touchable: {
    borderRadius: 50,
    overflow: "hidden",
  },
  blurContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 10,
    paddingLeft: 20,
    paddingVertical: 0,
    height: BAR_HEIGHT,
    backgroundColor: "rgba(40, 40, 40, 0.5)",
  },
  androidContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
    height: BAR_HEIGHT,
    backgroundColor: "rgba(28, 28, 30, 0.97)",
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  albumArt: {
    width: 32,
    height: 32,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#333",
  },
  albumImage: {
    width: "100%",
    height: "100%",
  },
  albumPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2a2a2a",
  },
  trackInfo: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
    justifyContent: "center",
  },
  trackTitle: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },
  artistName: {
    color: "rgba(255, 255, 255, 0.6)",
    fontSize: 12,
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
  },
  controlButton: {
    padding: 8,
  },
  progressContainer: {
    position: "absolute",
    bottom: 0,
    left: 10,
    right: 10,
    height: 3,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    borderRadius: 1.5,
  },
  progressFill: {
    height: "100%",
    backgroundColor: "white",
    borderRadius: 1.5,
  },
});
