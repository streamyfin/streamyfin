/**
 * AirPlay Mini Player
 * Compact player bar shown at bottom of screen when AirPlaying
 * iOS only component
 */

import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useAtomValue } from "jotai";
import React from "react";
import { Platform, Pressable, View } from "react-native";
import Animated, { SlideInDown, SlideOutDown } from "react-native-reanimated";
import { useAirPlayPlayer } from "@/components/airplay/hooks/useAirPlayPlayer";
import { Text } from "@/components/common/Text";
import { apiAtom } from "@/providers/JellyfinProvider";
import { formatTime, getPosterUrl } from "@/utils/airplay/helpers";
import { AIRPLAY_CONSTANTS } from "@/utils/airplay/options";

export const AirPlayMiniPlayer: React.FC = () => {
  const api = useAtomValue(apiAtom);
  const {
    isAirPlayAvailable,
    isConnected,
    currentItem,
    currentDevice,
    progress,
    duration,
    isPlaying,
    togglePlayPause,
  } = useAirPlayPlayer(null);

  // Only show on iOS when connected
  if (
    Platform.OS !== "ios" ||
    !isAirPlayAvailable ||
    !isConnected ||
    !currentItem
  ) {
    return null;
  }

  const posterUrl = getPosterUrl(
    api?.basePath,
    currentItem.Id,
    currentItem.ImageTags?.Primary,
    80,
    120,
  );

  const progressPercent = duration > 0 ? (progress / duration) * 100 : 0;

  const handlePress = () => {
    router.push("/airplay-player");
  };

  return (
    <Animated.View
      entering={SlideInDown.duration(AIRPLAY_CONSTANTS.ANIMATION_DURATION)}
      exiting={SlideOutDown.duration(AIRPLAY_CONSTANTS.ANIMATION_DURATION)}
      style={{
        position: "absolute",
        bottom: 49, // Above tab bar
        left: 0,
        right: 0,
        backgroundColor: "#1a1a1a",
        borderTopWidth: 1,
        borderTopColor: "#333",
      }}
    >
      <Pressable onPress={handlePress}>
        {/* Progress bar */}
        <View
          style={{
            height: 3,
            backgroundColor: "#333",
          }}
        >
          <View
            style={{
              height: "100%",
              width: `${progressPercent}%`,
              backgroundColor: "#007AFF",
            }}
          />
        </View>

        {/* Content */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            padding: 12,
            gap: 12,
          }}
        >
          {/* Poster */}
          {posterUrl && (
            <Image
              source={{ uri: posterUrl }}
              style={{
                width: 40,
                height: 60,
                borderRadius: 4,
              }}
              contentFit='cover'
            />
          )}

          {/* Info */}
          <View style={{ flex: 1 }}>
            <Text
              style={{
                color: "white",
                fontSize: 14,
                fontWeight: "600",
              }}
              numberOfLines={1}
            >
              {currentItem.Name}
            </Text>
            {currentItem.SeriesName && (
              <Text
                style={{
                  color: "#999",
                  fontSize: 12,
                }}
                numberOfLines={1}
              >
                {currentItem.SeriesName}
              </Text>
            )}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                marginTop: 2,
              }}
            >
              <Ionicons name='logo-apple' size={12} color='#007AFF' />
              <Text
                style={{
                  color: "#007AFF",
                  fontSize: 11,
                }}
                numberOfLines={1}
              >
                {currentDevice?.name || "AirPlay"}
              </Text>
              <Text
                style={{
                  color: "#666",
                  fontSize: 11,
                }}
              >
                {formatTime(progress)} / {formatTime(duration)}
              </Text>
            </View>
          </View>

          {/* Play/Pause button */}
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              togglePlayPause();
            }}
            style={{
              padding: 8,
            }}
          >
            <Ionicons
              name={isPlaying ? "pause" : "play"}
              size={28}
              color='white'
            />
          </Pressable>
        </View>
      </Pressable>
    </Animated.View>
  );
};
