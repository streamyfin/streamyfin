import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useAtomValue } from "jotai";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  type ImageSourcePropType,
  Platform,
  Pressable,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AudioCastButton } from "@/components/audio-player/AudioCastButton";
import { Text } from "@/components/common/Text";
import { LikeButton } from "@/components/music/LikeButton";
import {
  miniPlayerVisibleAtom,
  useAudioPlayer,
} from "@/providers/AudioPlayerProvider";

const TAB_BAR_HEIGHT = Platform.OS === "ios" ? 49 : 56;
const MINI_PLAYER_HEIGHT = 64;
const PROGRESS_BAR_HEIGHT = 2;
const EXPANDED_CONTROLS_HEIGHT = 70;

interface CustomTabBarWithPlayerProps {
  state: any;
  descriptors: any;
  navigation: any;
}

function CustomTabBarWithPlayerComponent({
  state,
  descriptors,
  navigation,
}: CustomTabBarWithPlayerProps) {
  const insets = useSafeAreaInsets();
  const {
    state: audioState,
    togglePlayPause,
    skipToNext,
    skipToPrevious,
    toggleShuffle,
    setRepeatMode,
    clearQueue,
    castToSession,
    castToChromecast,
    disconnectFromRemote,
  } = useAudioPlayer();
  const miniPlayerVisible = useAtomValue(miniPlayerVisibleAtom);
  const [isExpanded, setIsExpanded] = useState(false);
  const { width: screenWidth } = useWindowDimensions();
  const previousTrackId = useRef<string | null>(null);
  const skipDirection = useRef<"left" | "right" | null>(null);

  const {
    currentTrack,
    isPlaying,
    isBuffering,
    position,
    duration,
    shuffleEnabled,
    repeatMode,
  } = audioState;

  const showMiniPlayer = currentTrack && miniPlayerVisible;

  // Calculate progress percentage
  const progressPercentage = duration > 0 ? (position / duration) * 100 : 0;

  const progressStyle = useAnimatedStyle(() => {
    return {
      width: withTiming(`${progressPercentage}%`, { duration: 100 }),
    };
  }, [progressPercentage]);

  // Animation values
  const expandedHeight = useSharedValue(0);
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(1);

  // Animate tab bar height
  const tabBarStyle = useAnimatedStyle(() => {
    const baseHeight = showMiniPlayer
      ? TAB_BAR_HEIGHT + MINI_PLAYER_HEIGHT + insets.bottom
      : TAB_BAR_HEIGHT + insets.bottom;

    return {
      height: withSpring(baseHeight + expandedHeight.value, {
        damping: 20,
        stiffness: 200,
      }),
    };
  }, [showMiniPlayer, insets.bottom, expandedHeight.value]);

  const handleMiniPlayerPress = useCallback(() => {
    router.push("/(auth)/audio-player");
  }, []);

  const handlePlayPause = useCallback(
    (e: any) => {
      e.stopPropagation();
      togglePlayPause();
    },
    [togglePlayPause],
  );

  const handleSkipNext = useCallback(() => {
    skipToNext();
  }, [skipToNext]);

  const handleSkipPrevious = useCallback(() => {
    skipToPrevious();
  }, [skipToPrevious]);

  const handleToggleShuffle = useCallback(
    (e: any) => {
      e.stopPropagation();
      toggleShuffle();
    },
    [toggleShuffle],
  );

  const handleCycleRepeat = useCallback(
    (e: any) => {
      e.stopPropagation();
      const modes: Array<"off" | "one" | "all" | "album"> = [
        "off",
        "all",
        "album",
        "one",
      ];
      const currentIndex = modes.indexOf(repeatMode);
      const nextMode = modes[(currentIndex + 1) % modes.length];
      setRepeatMode(nextMode);
    },
    [repeatMode, setRepeatMode],
  );

  const handleStop = useCallback(
    (e: any) => {
      e.stopPropagation();
      clearQueue();
      setIsExpanded(false);
    },
    [clearQueue],
  );

  // Detect track changes and animate new track in
  useEffect(() => {
    if (currentTrack?.id && currentTrack.id !== previousTrackId.current) {
      if (previousTrackId.current !== null) {
        if (skipDirection.current) {
          // Swiped - position new track off-screen then slide it in
          if (skipDirection.current === "left") {
            // Swiped left (next track) - new track enters from right
            translateX.value = screenWidth;
          } else {
            // Swiped right (previous track) - new track enters from left
            translateX.value = -screenWidth;
          }
          opacity.value = 0;

          // Animate to center
          translateX.value = withTiming(0, { duration: 300 });
          opacity.value = withTiming(1, { duration: 300 });

          skipDirection.current = null; // Reset
        } else {
          // Track changed without swipe (e.g., auto-play) - ensure visible
          translateX.value = 0;
          opacity.value = 1;
        }
      } else {
        // First track - ensure visible
        translateX.value = 0;
        opacity.value = 1;
      }
      previousTrackId.current = currentTrack.id;
    }
  }, [currentTrack?.id, screenWidth]);

  // Gesture handling
  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      const isHorizontalSwipe =
        Math.abs(event.translationX) > Math.abs(event.translationY);

      if (isHorizontalSwipe) {
        // Horizontal swipe for track skipping
        translateX.value = event.translationX;
        opacity.value = Math.max(0, 1 - Math.abs(event.translationX) / 300);
      } else {
        // Vertical swipe for expanding/collapsing
        if (event.translationY < 0 && !isExpanded) {
          // Swipe up to expand
          expandedHeight.value = Math.min(
            Math.abs(event.translationY),
            EXPANDED_CONTROLS_HEIGHT,
          );
        } else if (event.translationY > 0 && isExpanded) {
          // Swipe down to collapse
          expandedHeight.value = Math.max(
            EXPANDED_CONTROLS_HEIGHT - event.translationY,
            0,
          );
        }
      }
    })
    .onEnd((event) => {
      const isHorizontalSwipe =
        Math.abs(event.translationX) > Math.abs(event.translationY);
      const SWIPE_THRESHOLD = 50;

      if (isHorizontalSwipe) {
        // Handle horizontal swipe
        if (event.translationX > SWIPE_THRESHOLD) {
          // Swipe right - slide current track out right while new track slides in from left
          skipDirection.current = "right";
          translateX.value = withTiming(screenWidth, { duration: 300 });
          opacity.value = withTiming(0, { duration: 300 });
          // Call skip immediately so new track starts sliding in while old one slides out
          runOnJS(handleSkipPrevious)();
        } else if (event.translationX < -SWIPE_THRESHOLD) {
          // Swipe left - slide current track out left while new track slides in from right
          skipDirection.current = "left";
          translateX.value = withTiming(-screenWidth, { duration: 300 });
          opacity.value = withTiming(0, { duration: 300 });
          // Call skip immediately so new track starts sliding in while old one slides out
          runOnJS(handleSkipNext)();
        } else {
          // Didn't meet threshold - bounce back
          translateX.value = withSpring(0);
          opacity.value = withSpring(1);
        }
      } else {
        // Handle vertical swipe
        if (event.translationY < -SWIPE_THRESHOLD && !isExpanded) {
          // Swipe up - expand
          expandedHeight.value = withSpring(EXPANDED_CONTROLS_HEIGHT);
          runOnJS(setIsExpanded)(true);
        } else if (event.translationY > SWIPE_THRESHOLD && isExpanded) {
          // Swipe down - collapse
          expandedHeight.value = withSpring(0);
          runOnJS(setIsExpanded)(false);
        } else {
          // Reset to current state
          expandedHeight.value = withSpring(
            isExpanded ? EXPANDED_CONTROLS_HEIGHT : 0,
          );
        }
      }
    });

  const expandedAnimatedStyle = useAnimatedStyle(() => ({
    height: expandedHeight.value,
    opacity: expandedHeight.value / EXPANDED_CONTROLS_HEIGHT,
  }));

  const contentAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[styles.container, tabBarStyle]}>
      {/* Mini Player Section */}
      {showMiniPlayer && (
        <GestureDetector gesture={panGesture}>
          <View style={styles.miniPlayerSection}>
            {/* Progress bar */}
            <View style={styles.progressBarContainer}>
              <Animated.View style={[styles.progressBar, progressStyle]} />
            </View>

            {/* Expanded controls */}
            {isExpanded && (
              <Animated.View
                style={[styles.expandedControls, expandedAnimatedStyle]}
              >
                <View style={styles.expandedControlsContent}>
                  {/* Shuffle */}
                  <TouchableOpacity
                    onPress={handleToggleShuffle}
                    style={styles.expandedButton}
                  >
                    <Ionicons
                      name='shuffle'
                      size={24}
                      color={shuffleEnabled ? "#9333ea" : "#6b7280"}
                    />
                  </TouchableOpacity>

                  {/* Repeat */}
                  <TouchableOpacity
                    onPress={handleCycleRepeat}
                    style={styles.expandedButton}
                  >
                    <Ionicons
                      name='repeat'
                      size={24}
                      color={repeatMode === "off" ? "#6b7280" : "#9333ea"}
                    />
                    {repeatMode === "one" && (
                      <View style={styles.repeatBadge}>
                        <Text style={styles.repeatBadgeText}>1</Text>
                      </View>
                    )}
                    {repeatMode === "album" && (
                      <View style={styles.repeatBadge}>
                        <Text style={styles.repeatBadgeText}>A</Text>
                      </View>
                    )}
                  </TouchableOpacity>

                  {/* Close/Stop */}
                  <TouchableOpacity
                    onPress={handleStop}
                    style={styles.expandedButton}
                  >
                    <Ionicons name='close' size={24} color='#ef4444' />
                  </TouchableOpacity>
                </View>
              </Animated.View>
            )}

            <Pressable
              style={styles.miniPlayerContent}
              onPress={handleMiniPlayerPress}
            >
              <View style={styles.contentRow}>
                {/* Song info (artwork + track info) - animated on swipe */}
                <Animated.View
                  style={[styles.songInfoContainer, contentAnimatedStyle]}
                >
                  {/* Album artwork */}
                  <View style={styles.artworkContainer}>
                    {currentTrack.artwork ? (
                      <Image
                        key={currentTrack.artwork}
                        source={{ uri: currentTrack.artwork }}
                        style={styles.artwork}
                        contentFit='cover'
                        transition={200}
                      />
                    ) : (
                      <View style={styles.artworkPlaceholder}>
                        <Ionicons
                          name='musical-note'
                          size={24}
                          color='#9ca3af'
                        />
                      </View>
                    )}
                  </View>

                  {/* Track info */}
                  <View style={styles.infoContainer}>
                    <Text numberOfLines={1} style={styles.title}>
                      {currentTrack.title}
                    </Text>
                    <Text numberOfLines={1} style={styles.artist}>
                      {currentTrack.artist || "Unknown Artist"}
                    </Text>
                  </View>
                </Animated.View>

                {/* Controls - stay fixed (not animated) */}
                <View style={styles.controlsContainer}>
                  {/* Like button */}
                  {currentTrack.jellyfinItem && (
                    <LikeButton
                      item={currentTrack.jellyfinItem}
                      size={24}
                      color='#6b7280'
                      activeColor='#9333ea'
                    />
                  )}

                  {/* Cast Button */}
                  <AudioCastButton
                    compact={true}
                    onCastToSession={castToSession}
                    onCastToChromecast={castToChromecast}
                    onDisconnect={disconnectFromRemote}
                  />

                  {/* Play/Pause button */}
                  <TouchableOpacity
                    onPress={handlePlayPause}
                    style={styles.playButton}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    {isBuffering ? (
                      <Ionicons name='hourglass' size={28} color='white' />
                    ) : isPlaying ? (
                      <Ionicons name='pause' size={28} color='white' />
                    ) : (
                      <Ionicons name='play' size={28} color='white' />
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </Pressable>

            {/* Swipe indicator */}
            <View style={styles.swipeIndicator}>
              <View style={styles.swipeIndicatorBar} />
            </View>
          </View>
        </GestureDetector>
      )}

      {/* Tab Bar Section */}
      <View style={styles.tabBarSection}>
        {state.routes.map((route: any, index: number) => {
          const { options } = descriptors[route.key];

          // Skip hidden tabs
          if (options.tabBarItemHidden) {
            return null;
          }

          const isFocused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          const onLongPress = () => {
            navigation.emit({
              type: "tabLongPress",
              target: route.key,
            });
          };

          // Get icon based on platform and route
          const getIcon = () => {
            if (!options.tabBarIcon) return null;

            if (
              Platform.OS === "android" &&
              typeof options.tabBarIcon === "function"
            ) {
              const iconResult = options.tabBarIcon({
                focused: isFocused,
                color: "",
                size: 0,
              });
              return iconResult;
            }

            // For iOS, we'd use SF Symbols (handled by native component)
            return null;
          };

          const icon = getIcon();

          return (
            <TouchableOpacity
              key={route.key}
              accessibilityRole='button'
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel}
              onPress={onPress}
              onLongPress={onLongPress}
              style={styles.tabButton}
            >
              {icon && Platform.OS === "android" && (
                <Image
                  source={icon as ImageSourcePropType}
                  style={[
                    styles.tabIcon,
                    { tintColor: isFocused ? "#9333ea" : "#6b7280" },
                  ]}
                  contentFit='contain'
                />
              )}
              <Text
                style={[
                  styles.tabLabel,
                  { color: isFocused ? "#9333ea" : "#6b7280" },
                ]}
              >
                {options.title}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#121212",
    borderTopWidth: 1,
    borderTopColor: "#2c2c2e",
  },
  miniPlayerSection: {
    borderBottomWidth: 1,
    borderBottomColor: "#2c2c2e",
  },
  progressBarContainer: {
    height: PROGRESS_BAR_HEIGHT,
    backgroundColor: "#3a3a3c",
  },
  progressBar: {
    height: "100%",
    backgroundColor: "#9333ea",
  },
  expandedControls: {
    overflow: "hidden",
    borderBottomWidth: 1,
    borderBottomColor: "#2c2c2e",
  },
  expandedControlsContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 32,
    paddingVertical: 12,
  },
  expandedButton: {
    padding: 8,
    position: "relative",
  },
  repeatBadge: {
    position: "absolute",
    bottom: 4,
    right: 4,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#9333ea",
    justifyContent: "center",
    alignItems: "center",
  },
  repeatBadgeText: {
    fontSize: 10,
    fontWeight: "bold",
    color: "white",
  },
  miniPlayerContent: {
    height: MINI_PLAYER_HEIGHT,
  },
  contentRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  songInfoContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  artworkContainer: {
    width: 48,
    height: 48,
    borderRadius: 6,
    overflow: "hidden",
    marginRight: 12,
  },
  artwork: {
    width: "100%",
    height: "100%",
  },
  artworkPlaceholder: {
    width: "100%",
    height: "100%",
    backgroundColor: "#2c2c2e",
    justifyContent: "center",
    alignItems: "center",
  },
  infoContainer: {
    flex: 1,
    justifyContent: "center",
  },
  title: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },
  artist: {
    color: "#9ca3af",
    fontSize: 12,
    marginTop: 2,
  },
  controlsContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  playButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#9333ea",
    justifyContent: "center",
    alignItems: "center",
  },
  swipeIndicator: {
    alignItems: "center",
    paddingVertical: 4,
  },
  swipeIndicatorBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#3c3c3e",
  },
  tabBarSection: {
    flexDirection: "row",
    height: TAB_BAR_HEIGHT,
  },
  tabButton: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  tabIcon: {
    width: 24,
    height: 24,
    marginBottom: 2,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: "500",
  },
});

export const CustomTabBarWithPlayer = memo(CustomTabBarWithPlayerComponent);
