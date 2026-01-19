/**
 * Mini Chromecast player bar shown at the bottom of the screen
 * Similar to music player mini bar
 */

import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, View } from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/common/Text";
import { formatEpisodeInfo, truncateTitle } from "@/utils/chromecast/helpers";
import { CHROMECAST_CONSTANTS } from "@/utils/chromecast/options";
import { useChromecastPlayer } from "./hooks/useChromecastPlayer";

export const ChromecastMiniPlayer: React.FC = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { playerState, currentItem, togglePlay, showNextEpisodeCountdown } =
    useChromecastPlayer();

  // Don't show if not connected or no media
  if (!playerState.isConnected || !playerState.currentItemId) {
    return null;
  }

  const handlePress = () => {
    router.push("/chromecast-player");
  };

  const progress =
    playerState.duration > 0
      ? (playerState.progress / playerState.duration) * 100
      : 0;

  return (
    <Animated.View
      entering={SlideInDown.duration(CHROMECAST_CONSTANTS.ANIMATION_DURATION)}
      exiting={SlideOutDown.duration(CHROMECAST_CONSTANTS.ANIMATION_DURATION)}
      style={{
        position: "absolute",
        bottom: insets.bottom,
        left: 0,
        right: 0,
        backgroundColor: "#1a1a1a",
        borderTopWidth: 1,
        borderTopColor: "#333",
        zIndex: 1000,
      }}
    >
      {/* Progress bar */}
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          backgroundColor: "#333",
        }}
      >
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            height: 2,
            width: `${progress}%`,
            backgroundColor: "#e50914",
          }}
        />
      </View>

      <Pressable onPress={handlePress}>
        <View
          style={{
            height: CHROMECAST_CONSTANTS.MINI_PLAYER_HEIGHT,
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 16,
            gap: 12,
          }}
        >
          {/* Cast icon */}
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 4,
              backgroundColor: "#333",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Ionicons name='tv' size={24} color='#e50914' />
          </View>

          {/* Media info */}
          <View style={{ flex: 1 }}>
            {currentItem && (
              <>
                <Text
                  style={{
                    color: "white",
                    fontSize: 14,
                    fontWeight: "600",
                  }}
                  numberOfLines={1}
                >
                  {truncateTitle(currentItem.Name || "Unknown", 40)}
                </Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Text
                    style={{
                      color: "#999",
                      fontSize: 12,
                    }}
                  >
                    {formatEpisodeInfo(
                      currentItem.ParentIndexNumber,
                      currentItem.IndexNumber,
                    )}
                  </Text>
                  {showNextEpisodeCountdown && (
                    <Animated.Text
                      entering={FadeIn}
                      exiting={FadeOut}
                      style={{
                        color: "#e50914",
                        fontSize: 12,
                        fontWeight: "600",
                      }}
                    >
                      Next episode starting...
                    </Animated.Text>
                  )}
                </View>
              </>
            )}
            {!currentItem && (
              <>
                <Text
                  style={{
                    color: "white",
                    fontSize: 14,
                    fontWeight: "600",
                  }}
                >
                  Casting to {playerState.deviceName || "Chromecast"}
                </Text>
                <Text
                  style={{
                    color: "#999",
                    fontSize: 12,
                  }}
                >
                  {playerState.isPlaying ? "Playing" : "Paused"}
                </Text>
              </>
            )}
          </View>

          {/* Play/Pause button */}
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              togglePlay();
            }}
            style={{
              width: 48,
              height: 48,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            {playerState.isBuffering ? (
              <Ionicons name='hourglass-outline' size={24} color='white' />
            ) : (
              <Ionicons
                name={playerState.isPlaying ? "pause" : "play"}
                size={28}
                color='white'
              />
            )}
          </Pressable>
        </View>
      </Pressable>
    </Animated.View>
  );
};
