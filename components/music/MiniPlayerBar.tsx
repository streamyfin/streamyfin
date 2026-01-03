import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useAtom } from "jotai";
import React, { useCallback, useMemo } from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { GlassEffectView } from "react-native-glass-effect-view";
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/common/Text";
import { apiAtom } from "@/providers/JellyfinProvider";
import { useMusicPlayer } from "@/providers/MusicPlayerProvider";

const HORIZONTAL_MARGIN = Platform.OS === "android" ? 8 : 16;
const BOTTOM_TAB_HEIGHT = Platform.OS === "android" ? 56 : 52;
const BAR_HEIGHT = Platform.OS === "android" ? 58 : 50;

// Gesture thresholds
const VELOCITY_THRESHOLD = 1000;

// Logarithmic slowdown - never stops, just gets progressively slower
const rubberBand = (distance: number, scale: number = 8): number => {
  "worklet";
  const absDistance = Math.abs(distance);
  const sign = distance < 0 ? -1 : 1;
  // Logarithmic: keeps growing but slower and slower
  return sign * scale * Math.log(1 + absDistance / scale);
};

export const MiniPlayerBar: React.FC = () => {
  const [api] = useAtom(apiAtom);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    currentTrack,
    isPlaying,
    isLoading,
    progress,
    duration,
    togglePlayPause,
    next,
    stop,
  } = useMusicPlayer();

  // Gesture state
  const translateY = useSharedValue(0);

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

  const handleDismiss = useCallback(() => {
    stop();
  }, [stop]);

  // Pan gesture for swipe up (open modal) and swipe down (dismiss)
  const panGesture = Gesture.Pan()
    .activeOffsetY([-15, 15])
    .onUpdate((event) => {
      // Logarithmic slowdown - keeps moving but progressively slower
      translateY.value = rubberBand(event.translationY, 6);
    })
    .onEnd((event) => {
      const velocity = event.velocityY;
      const currentPosition = translateY.value;

      // Swipe up - open modal (check position OR velocity)
      if (currentPosition < -16 || velocity < -VELOCITY_THRESHOLD) {
        // Slow return animation - won't jank with navigation
        translateY.value = withTiming(0, {
          duration: 600,
          easing: Easing.out(Easing.cubic),
        });
        runOnJS(handlePress)();
        return;
      }
      // Swipe down - stop playback and dismiss (check position OR velocity)
      if (currentPosition > 16 || velocity > VELOCITY_THRESHOLD) {
        // No need to reset - component will unmount
        runOnJS(handleDismiss)();
        return;
      }

      // Only animate back if no action was triggered
      translateY.value = withTiming(0, {
        duration: 200,
        easing: Easing.out(Easing.cubic),
      });
    });

  // Animated styles for the container
  const animatedContainerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  // Animated styles for the inner bar
  const animatedBarStyle = useAnimatedStyle(() => ({
    height: interpolate(
      translateY.value,
      [-50, 0, 50],
      [BAR_HEIGHT + 12, BAR_HEIGHT, BAR_HEIGHT],
      Extrapolation.EXTEND,
    ),
    opacity: interpolate(
      translateY.value,
      [0, 30],
      [1, 0.6],
      Extrapolation.CLAMP,
    ),
  }));

  if (!currentTrack) return null;

  const content = (
    <>
      {/* Tappable area: Album art + Track info */}
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.7}
        style={styles.tappableArea}
      >
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
      </TouchableOpacity>

      {/* Controls */}
      <View style={styles.controls}>
        {isLoading ? (
          <ActivityIndicator size='small' color='white' style={styles.loader} />
        ) : (
          <>
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
          </>
        )}
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
    <GestureDetector gesture={panGesture}>
      <Animated.View
        style={[
          styles.container,
          {
            bottom:
              BOTTOM_TAB_HEIGHT +
              insets.bottom +
              (Platform.OS === "android" ? 32 : 4),
          },
          animatedContainerStyle,
        ]}
      >
        <Animated.View style={[styles.touchable, animatedBarStyle]}>
          {Platform.OS === "ios" ? (
            <GlassEffectView style={styles.blurContainer}>
              <View
                style={{
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  paddingRight: 10,
                  paddingLeft: 20,
                }}
              >
                {content}
              </View>
            </GlassEffectView>
          ) : (
            <View style={styles.androidContainer}>{content}</View>
          )}
        </Animated.View>
      </Animated.View>
    </GestureDetector>
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
    flex: 1,
  },
  androidContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "rgba(28, 28, 30, 0.97)",
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  tappableArea: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
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
  loader: {
    marginHorizontal: 16,
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
