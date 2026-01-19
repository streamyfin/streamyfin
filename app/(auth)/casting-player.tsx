/**
 * Unified Casting Player Modal
 * Full-screen player for both Chromecast and AirPlay
 */

import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useAtomValue } from "jotai";
import { useCallback } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/common/Text";
import { useCasting } from "@/hooks/useCasting";
import { apiAtom } from "@/providers/JellyfinProvider";
import {
  calculateEndingTime,
  formatTime,
  getPosterUrl,
  getProtocolIcon,
  getProtocolName,
  truncateTitle,
} from "@/utils/casting/helpers";
import { PROTOCOL_COLORS } from "@/utils/casting/types";

export default function CastingPlayerScreen() {
  const insets = useSafeAreaInsets();
  const api = useAtomValue(apiAtom);

  const {
    isConnected,
    protocol,
    currentItem,
    currentDevice,
    progress,
    duration,
    isPlaying,
    isBuffering,
    togglePlayPause,
    skipForward,
    skipBackward,
    stop,
  } = useCasting(null);

  // Swipe down to dismiss gesture
  const translateY = useSharedValue(0);
  const context = useSharedValue({ y: 0 });

  const dismissModal = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    }
  }, []);

  const panGesture = Gesture.Pan()
    .onStart(() => {
      context.value = { y: translateY.value };
    })
    .onUpdate((event) => {
      if (event.translationY > 0) {
        translateY.value = event.translationY;
      }
    })
    .onEnd((event) => {
      if (event.translationY > 100) {
        translateY.value = withSpring(500, {}, () => {
          runOnJS(dismissModal)();
        });
      } else {
        translateY.value = withSpring(0);
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  // Redirect if not connected
  if (!isConnected || !currentItem || !protocol) {
    if (router.canGoBack()) {
      router.back();
    }
    return null;
  }

  const posterUrl = getPosterUrl(
    api?.basePath,
    currentItem.Id,
    currentItem.ImageTags?.Primary,
    300,
    450,
  );

  const progressPercent = duration > 0 ? (progress / duration) * 100 : 0;
  const protocolColor = PROTOCOL_COLORS[protocol];
  const protocolIcon = getProtocolIcon(protocol);
  const protocolName = getProtocolName(protocol);

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View
        style={[
          {
            flex: 1,
            backgroundColor: "#000",
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
          },
          animatedStyle,
        ]}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: 20,
          }}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 32,
            }}
          >
            <Pressable
              onPress={dismissModal}
              style={{ padding: 8, marginLeft: -8 }}
            >
              <Ionicons name='chevron-down' size={32} color='white' />
            </Pressable>

            {/* Connection indicator */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingHorizontal: 12,
                paddingVertical: 6,
                backgroundColor: "#1a1a1a",
                borderRadius: 16,
              }}
            >
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: protocolColor,
                }}
              />
              <Text
                style={{
                  color: protocolColor,
                  fontSize: 12,
                  fontWeight: "500",
                }}
              >
                {protocolName}
              </Text>
            </View>

            <View style={{ width: 48 }} />
          </View>

          {/* Title and episode info */}
          <View style={{ marginBottom: 24 }}>
            <Text
              style={{
                color: "white",
                fontSize: 28,
                fontWeight: "700",
                textAlign: "center",
              }}
            >
              {truncateTitle(currentItem.Name || "Unknown", 50)}
            </Text>
            {currentItem.SeriesName && (
              <Text
                style={{
                  color: "#999",
                  fontSize: 16,
                  textAlign: "center",
                  marginTop: 8,
                }}
              >
                {currentItem.SeriesName}
                {currentItem.ParentIndexNumber &&
                  currentItem.IndexNumber &&
                  ` • S${currentItem.ParentIndexNumber}:E${currentItem.IndexNumber}`}
              </Text>
            )}
          </View>

          {/* Poster with buffering overlay */}
          <View
            style={{
              alignItems: "center",
              marginBottom: 32,
            }}
          >
            <View
              style={{
                width: 300,
                height: 450,
                borderRadius: 12,
                overflow: "hidden",
                position: "relative",
              }}
            >
              {posterUrl ? (
                <Image
                  source={{ uri: posterUrl }}
                  style={{ width: "100%", height: "100%" }}
                  contentFit='cover'
                />
              ) : (
                <View
                  style={{
                    width: "100%",
                    height: "100%",
                    backgroundColor: "#1a1a1a",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <Ionicons name='film-outline' size={64} color='#333' />
                </View>
              )}

              {/* Buffering overlay */}
              {isBuffering && (
                <View
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: "rgba(0,0,0,0.7)",
                    justifyContent: "center",
                    alignItems: "center",
                    backdropFilter: "blur(10px)",
                  }}
                >
                  <ActivityIndicator size='large' color={protocolColor} />
                  <Text
                    style={{
                      color: "white",
                      fontSize: 16,
                      marginTop: 16,
                    }}
                  >
                    Buffering...
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Device info */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              marginBottom: 32,
            }}
          >
            <Ionicons name={protocolIcon} size={20} color={protocolColor} />
            <Text style={{ color: protocolColor, fontSize: 15 }}>
              {currentDevice?.name || protocolName}
            </Text>
          </View>

          {/* Progress slider */}
          <View style={{ marginBottom: 12 }}>
            <View
              style={{
                height: 4,
                backgroundColor: "#333",
                borderRadius: 2,
                overflow: "hidden",
              }}
            >
              <View
                style={{
                  height: "100%",
                  width: `${progressPercent}%`,
                  backgroundColor: protocolColor,
                }}
              />
            </View>
          </View>

          {/* Time display */}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              marginBottom: 32,
            }}
          >
            <Text style={{ color: "#999", fontSize: 13 }}>
              {formatTime(progress)}
            </Text>
            <Text style={{ color: "#999", fontSize: 13 }}>
              Ending at {calculateEndingTime(progress, duration)}
            </Text>
            <Text style={{ color: "#999", fontSize: 13 }}>
              {formatTime(duration)}
            </Text>
          </View>

          {/* Playback controls */}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "center",
              alignItems: "center",
              gap: 32,
              marginBottom: 48,
            }}
          >
            {/* Rewind 10s */}
            <Pressable onPress={() => skipBackward(10)} style={{ padding: 16 }}>
              <Ionicons name='play-back' size={32} color='white' />
            </Pressable>

            {/* Play/Pause */}
            <Pressable
              onPress={togglePlayPause}
              style={{
                width: 72,
                height: 72,
                borderRadius: 36,
                backgroundColor: protocolColor,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Ionicons
                name={isPlaying ? "pause" : "play"}
                size={36}
                color='white'
                style={{ marginLeft: isPlaying ? 0 : 4 }}
              />
            </Pressable>

            {/* Forward 10s */}
            <Pressable onPress={() => skipForward(10)} style={{ padding: 16 }}>
              <Ionicons name='play-forward' size={32} color='white' />
            </Pressable>
          </View>

          {/* Stop casting button */}
          <Pressable
            onPress={stop}
            style={{
              backgroundColor: "#1a1a1a",
              padding: 16,
              borderRadius: 12,
              flexDirection: "row",
              justifyContent: "center",
              alignItems: "center",
              gap: 8,
              marginBottom: 24,
            }}
          >
            <Ionicons name='stop-circle-outline' size={20} color='#FF3B30' />
            <Text style={{ color: "#FF3B30", fontSize: 16, fontWeight: "600" }}>
              Stop Casting
            </Text>
          </Pressable>
        </ScrollView>
      </Animated.View>
    </GestureDetector>
  );
}
