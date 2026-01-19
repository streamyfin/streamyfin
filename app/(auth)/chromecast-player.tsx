/**
 * Full Chromecast Player Modal
 * Displays when user taps mini player or cast button during playback
 */

import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useAtomValue } from "jotai";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  useWindowDimensions,
  View,
} from "react-native";
import { Slider } from "react-native-awesome-slider";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  FadeIn,
  FadeOut,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useChromecastPlayer } from "@/components/chromecast/hooks/useChromecastPlayer";
import { useChromecastSegments } from "@/components/chromecast/hooks/useChromecastSegments";
import { Text } from "@/components/common/Text";
import { useTrickplay } from "@/hooks/useTrickplay";
import { apiAtom } from "@/providers/JellyfinProvider";
import {
  formatEpisodeInfo,
  getPosterUrl,
  truncateTitle,
} from "@/utils/chromecast/helpers";
import { CHROMECAST_CONSTANTS } from "@/utils/chromecast/options";

interface ChromecastPlayerProps {
  visible: boolean;
  onClose: () => void;
}

export const ChromecastPlayer: React.FC<ChromecastPlayerProps> = ({
  visible,
  onClose,
}) => {
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const api = useAtomValue(apiAtom);

  const {
    playerState,
    showControls,
    currentItem,
    nextItem,
    stop,
    togglePlay,
    seek,
    skipForward,
    skipBackward,
    disconnect,
    setShowControls,
    currentTime,
    remainingTime,
    endingTime,
    showNextEpisodeCountdown,
    settings,
  } = useChromecastPlayer();

  const { currentSegment, skipSegment } = useChromecastSegments(
    currentItem,
    playerState.progress,
  );

  const { calculateTrickplayUrl, trickplayInfo } = useTrickplay(currentItem!);

  const [_showMenu, setShowMenu] = useState(false);
  const [_showDeviceSheet, setShowDeviceSheet] = useState(false);
  const [_showEpisodeList, setShowEpisodeList] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Slider values
  const progress = useSharedValue(playerState.progress);
  const min = useSharedValue(0);
  const max = useSharedValue(playerState.duration);
  const isSeeking = useSharedValue(false);

  // Update slider when player state changes
  React.useEffect(() => {
    if (!isSeeking.value) {
      progress.value = playerState.progress;
    }
    max.value = playerState.duration;
  }, [playerState.progress, playerState.duration, isSeeking]);

  // Swipe down to dismiss gesture
  const translateY = useSharedValue(0);
  const context = useSharedValue({ y: 0 });

  const gesture = Gesture.Pan()
    .onStart(() => {
      context.value = { y: translateY.value };
    })
    .onUpdate((event) => {
      if (event.translationY > 0) {
        translateY.value = context.value.y + event.translationY;
      }
    })
    .onEnd((event) => {
      if (event.translationY > 100) {
        translateY.value = withTiming(screenHeight, {}, () => {
          runOnJS(onClose)();
        });
      } else {
        translateY.value = withSpring(0);
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const posterUrl = useMemo(() => {
    if (!currentItem || !api) return null;
    return getPosterUrl(currentItem, api);
  }, [currentItem, api]);

  const handleSliderChange = useCallback(
    (value: number) => {
      progress.value = value;
      if (trickplayInfo && currentItem) {
        calculateTrickplayUrl(value);
      }
    },
    [calculateTrickplayUrl, trickplayInfo, currentItem],
  );

  const handleSliderComplete = useCallback(
    (value: number) => {
      isSeeking.value = false;
      seek(value);
    },
    [seek, isSeeking],
  );

  if (!playerState.isConnected || !visible) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      animationType='slide'
      presentationStyle='overFullScreen'
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <GestureDetector gesture={gesture}>
        <Animated.View
          style={[
            {
              flex: 1,
              backgroundColor: "#000",
            },
            animatedStyle,
          ]}
        >
          <Pressable style={{ flex: 1 }} onPress={setShowControls}>
            {/* Header - Collapsible */}
            <Animated.View
              entering={FadeIn}
              exiting={FadeOut}
              style={{
                position: "absolute",
                top: insets.top,
                left: 0,
                right: 0,
                zIndex: 10,
                paddingHorizontal: 16,
                paddingVertical: 12,
                backgroundColor: isCollapsed
                  ? "transparent"
                  : "rgba(0,0,0,0.5)",
              }}
            >
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
              >
                {/* Collapse arrow */}
                <Pressable
                  onPress={() => setIsCollapsed(!isCollapsed)}
                  style={{ padding: 4 }}
                >
                  <Ionicons
                    name={isCollapsed ? "chevron-down" : "chevron-up"}
                    size={24}
                    color='white'
                  />
                </Pressable>

                {/* Title and episode info */}
                <View style={{ flex: 1 }}>
                  {currentItem && (
                    <>
                      <Text
                        style={{
                          color: "white",
                          fontSize: 16,
                          fontWeight: "600",
                        }}
                        numberOfLines={1}
                      >
                        {truncateTitle(
                          currentItem.Name || "Unknown",
                          isCollapsed ? 50 : 35,
                        )}
                      </Text>
                      {!isCollapsed && (
                        <Text
                          style={{
                            color: "#ccc",
                            fontSize: 13,
                          }}
                          numberOfLines={1}
                        >
                          {formatEpisodeInfo(
                            currentItem.ParentIndexNumber,
                            currentItem.IndexNumber,
                          )}
                          {currentItem.SeriesName &&
                            ` • ${truncateTitle(currentItem.SeriesName, 25)}`}
                        </Text>
                      )}
                    </>
                  )}
                </View>

                {/* Connection quality indicator */}
                <View style={{ alignItems: "center" }}>
                  <Ionicons name='stats-chart' size={20} color='#4ade80' />
                </View>
              </View>
            </Animated.View>

            {/* Main content area */}
            <View
              style={{
                flex: 1,
                justifyContent: "center",
                alignItems: "center",
                paddingTop: insets.top + 60,
                paddingBottom: 200,
              }}
            >
              {/* Poster */}
              <View
                style={{
                  width: CHROMECAST_CONSTANTS.POSTER_WIDTH,
                  height: CHROMECAST_CONSTANTS.POSTER_HEIGHT,
                  borderRadius: 8,
                  overflow: "hidden",
                  backgroundColor: "#1a1a1a",
                }}
              >
                {posterUrl ? (
                  <Image
                    source={{ uri: posterUrl }}
                    style={{ width: "100%", height: "100%" }}
                    contentFit='cover'
                    transition={200}
                    blurRadius={
                      playerState.isBuffering
                        ? CHROMECAST_CONSTANTS.BLUR_RADIUS
                        : 0
                    }
                  />
                ) : (
                  <View
                    style={{
                      flex: 1,
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    <Ionicons name='film-outline' size={80} color='#333' />
                  </View>
                )}

                {/* Buffering indicator */}
                {playerState.isBuffering && (
                  <Animated.View
                    entering={FadeIn}
                    exiting={FadeOut}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      justifyContent: "center",
                      alignItems: "center",
                      backgroundColor: "rgba(0,0,0,0.3)",
                    }}
                  >
                    <ActivityIndicator size='large' color='#e50914' />
                  </Animated.View>
                )}
              </View>

              {/* Current segment indicator */}
              {currentSegment && (
                <Animated.View
                  entering={FadeIn}
                  exiting={FadeOut}
                  style={{
                    marginTop: 16,
                    paddingHorizontal: 16,
                    paddingVertical: 8,
                    backgroundColor: "rgba(229, 9, 20, 0.9)",
                    borderRadius: 20,
                  }}
                >
                  <Text
                    style={{ color: "white", fontSize: 12, fontWeight: "600" }}
                  >
                    {currentSegment.type.toUpperCase()} DETECTED
                  </Text>
                </Animated.View>
              )}
            </View>

            {/* Bottom controls */}
            {showControls && (
              <Animated.View
                entering={FadeIn.duration(
                  CHROMECAST_CONSTANTS.ANIMATION_DURATION,
                )}
                exiting={FadeOut.duration(
                  CHROMECAST_CONSTANTS.ANIMATION_DURATION,
                )}
                style={{
                  position: "absolute",
                  bottom: insets.bottom,
                  left: 0,
                  right: 0,
                  paddingHorizontal: 16,
                  paddingBottom: 20,
                  backgroundColor: "rgba(0,0,0,0.7)",
                }}
              >
                {/* Time display */}
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 8,
                  }}
                >
                  <Text style={{ color: "white", fontSize: 13 }}>
                    {currentTime}
                  </Text>
                  <Text style={{ color: "white", fontSize: 13 }}>
                    {remainingTime}
                  </Text>
                </View>

                {/* Progress slider */}
                <View style={{ height: 40, marginBottom: 8 }}>
                  <Slider
                    style={{ width: "100%", height: 40 }}
                    progress={progress}
                    minimumValue={min}
                    maximumValue={max}
                    theme={{
                      disableMinTrackTintColor: "#333",
                      maximumTrackTintColor: "#333",
                      minimumTrackTintColor: "#e50914",
                      cacheTrackTintColor: "#555",
                      bubbleBackgroundColor: "#e50914",
                    }}
                    onSlidingStart={() => {
                      isSeeking.value = true;
                    }}
                    onValueChange={handleSliderChange}
                    onSlidingComplete={handleSliderComplete}
                  />
                </View>

                {/* Ending time */}
                <Text
                  style={{
                    color: "#999",
                    fontSize: 11,
                    textAlign: "center",
                    marginBottom: 12,
                  }}
                >
                  Ending at {endingTime}
                </Text>

                {/* Control buttons row */}
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-around",
                    alignItems: "center",
                    marginBottom: 16,
                  }}
                >
                  {/* Skip segment button */}
                  {currentSegment && (
                    <Pressable
                      onPress={() => skipSegment(seek)}
                      style={{
                        paddingHorizontal: 16,
                        paddingVertical: 8,
                        backgroundColor: "#e50914",
                        borderRadius: 4,
                      }}
                    >
                      <Text
                        style={{
                          color: "white",
                          fontSize: 12,
                          fontWeight: "600",
                        }}
                      >
                        Skip {currentSegment.type}
                      </Text>
                    </Pressable>
                  )}

                  {/* Episode list button */}
                  {currentItem?.Type === "Episode" && (
                    <Pressable
                      onPress={() => setShowEpisodeList(true)}
                      style={{ padding: 8 }}
                    >
                      <Ionicons name='list' size={24} color='white' />
                    </Pressable>
                  )}

                  {/* Settings menu */}
                  <Pressable
                    onPress={() => setShowMenu(true)}
                    style={{ padding: 8 }}
                  >
                    <Ionicons
                      name='ellipsis-vertical'
                      size={24}
                      color='white'
                    />
                  </Pressable>

                  {/* Chromecast device info */}
                  <Pressable
                    onPress={() => setShowDeviceSheet(true)}
                    style={{ padding: 8 }}
                  >
                    <Ionicons name='tv' size={24} color='#e50914' />
                  </Pressable>
                </View>

                {/* Playback controls */}
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "center",
                    alignItems: "center",
                    gap: 32,
                  }}
                >
                  {/* Rewind */}
                  <Pressable onPress={skipBackward} style={{ padding: 8 }}>
                    <View
                      style={{ position: "relative", alignItems: "center" }}
                    >
                      <Ionicons name='play-back' size={32} color='white' />
                      <Text
                        style={{
                          position: "absolute",
                          color: "white",
                          fontSize: 10,
                          fontWeight: "bold",
                          top: 8,
                        }}
                      >
                        {settings?.rewindSkipTime || 15}
                      </Text>
                    </View>
                  </Pressable>

                  {/* Play/Pause */}
                  <Pressable
                    onPress={togglePlay}
                    style={{
                      width: 64,
                      height: 64,
                      borderRadius: 32,
                      backgroundColor: "#e50914",
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    <Ionicons
                      name={playerState.isPlaying ? "pause" : "play"}
                      size={32}
                      color='white'
                    />
                  </Pressable>

                  {/* Forward */}
                  <Pressable onPress={skipForward} style={{ padding: 8 }}>
                    <View
                      style={{ position: "relative", alignItems: "center" }}
                    >
                      <Ionicons name='play-forward' size={32} color='white' />
                      <Text
                        style={{
                          position: "absolute",
                          color: "white",
                          fontSize: 10,
                          fontWeight: "bold",
                          top: 8,
                        }}
                      >
                        {settings?.forwardSkipTime || 15}
                      </Text>
                    </View>
                  </Pressable>

                  {/* Stop */}
                  <Pressable onPress={stop} style={{ padding: 8 }}>
                    <Ionicons name='stop' size={28} color='white' />
                  </Pressable>
                </View>
              </Animated.View>
            )}

            {/* Next episode countdown */}
            {showNextEpisodeCountdown && nextItem && (
              <Animated.View
                entering={FadeIn}
                exiting={FadeOut}
                style={{
                  position: "absolute",
                  bottom: insets.bottom + 250,
                  left: 16,
                  right: 16,
                  padding: 16,
                  backgroundColor: "rgba(0,0,0,0.9)",
                  borderRadius: 8,
                }}
              >
                <Text style={{ color: "white", fontSize: 14, marginBottom: 8 }}>
                  Next: {truncateTitle(nextItem.Name || "Unknown", 40)}
                </Text>
                <Text style={{ color: "#999", fontSize: 12 }}>
                  Starting in{" "}
                  {Math.ceil(
                    (playerState.duration - playerState.progress) / 1000,
                  )}
                  s
                </Text>
              </Animated.View>
            )}
          </Pressable>
        </Animated.View>
      </GestureDetector>

      {/* TODO: Add settings menu modal */}
      {/* TODO: Add device info sheet modal */}
      {/* TODO: Add episode list modal */}
    </Modal>
  );
};
