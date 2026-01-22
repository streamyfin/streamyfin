/**
 * Unified Casting Mini Player
 * Works with all supported casting protocols
 */

import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useAtomValue } from "jotai";
import React from "react";
import { Pressable, View } from "react-native";
import Animated, { SlideInDown, SlideOutDown } from "react-native-reanimated";
import { Text } from "@/components/common/Text";
import { useCasting } from "@/hooks/useCasting";
import { apiAtom } from "@/providers/JellyfinProvider";
import {
  formatTime,
  getPosterUrl,
  getProtocolIcon,
  getProtocolName,
} from "@/utils/casting/helpers";
import { CASTING_CONSTANTS } from "@/utils/casting/types";

export const CastingMiniPlayer: React.FC = () => {
  const api = useAtomValue(apiAtom);
  const {
    isConnected,
    protocol,
    currentItem,
    currentDevice,
    progress,
    duration,
    isPlaying,
    togglePlayPause,
  } = useCasting(null);

  if (!isConnected || !currentItem || !protocol) {
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
  const protocolColor = "#a855f7"; // Streamyfin purple

  const handlePress = () => {
    router.push("/casting-player");
  };

  return (
    <Animated.View
      entering={SlideInDown.duration(CASTING_CONSTANTS.ANIMATION_DURATION)}
      exiting={SlideOutDown.duration(CASTING_CONSTANTS.ANIMATION_DURATION)}
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
              backgroundColor: protocolColor,
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
              <Ionicons
                name={getProtocolIcon(protocol)}
                size={12}
                color={protocolColor}
              />
              <Text
                style={{
                  color: protocolColor,
                  fontSize: 11,
                }}
                numberOfLines={1}
              >
                {currentDevice?.name || getProtocolName(protocol)}
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
