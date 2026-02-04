/**
 * Unified Casting Mini Player
 * Works with all supported casting protocols
 */

import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useAtomValue } from "jotai";
import React, { useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import {
  MediaPlayerState,
  useCastDevice,
  useMediaStatus,
  useRemoteMediaClient,
} from "react-native-google-cast";
import Animated, { SlideInDown, SlideOutDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/common/Text";
import { apiAtom } from "@/providers/JellyfinProvider";
import { formatTime, getPosterUrl } from "@/utils/casting/helpers";
import { CASTING_CONSTANTS } from "@/utils/casting/types";

export const CastingMiniPlayer: React.FC = () => {
  const api = useAtomValue(apiAtom);
  const insets = useSafeAreaInsets();
  const castDevice = useCastDevice();
  const mediaStatus = useMediaStatus();
  const remoteMediaClient = useRemoteMediaClient();

  const currentItem = useMemo(() => {
    return mediaStatus?.mediaInfo?.customData as BaseItemDto | undefined;
  }, [mediaStatus?.mediaInfo?.customData]);

  // Live progress state that updates every second when playing
  const [liveProgress, setLiveProgress] = useState(
    mediaStatus?.streamPosition || 0,
  );

  // Sync live progress with mediaStatus and poll every second when playing
  useEffect(() => {
    if (mediaStatus?.streamPosition) {
      setLiveProgress(mediaStatus.streamPosition);
    }

    // Update every second when playing
    const interval = setInterval(() => {
      if (
        mediaStatus?.playerState === MediaPlayerState.PLAYING &&
        mediaStatus?.streamPosition !== undefined
      ) {
        setLiveProgress((prev) => prev + 1);
      } else if (mediaStatus?.streamPosition !== undefined) {
        // Sync with actual position when paused/buffering
        setLiveProgress(mediaStatus.streamPosition);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [mediaStatus?.playerState, mediaStatus?.streamPosition]);

  const progress = liveProgress * 1000; // Convert to ms
  const duration = (mediaStatus?.mediaInfo?.streamDuration || 0) * 1000;
  const isPlaying = mediaStatus?.playerState === MediaPlayerState.PLAYING;

  // For episodes, use season poster; for other content, use item poster
  const posterUrl = useMemo(() => {
    if (!api?.basePath || !currentItem) return null;

    if (
      currentItem.Type === "Episode" &&
      currentItem.SeriesId &&
      currentItem.ParentIndexNumber
    ) {
      // Build season poster URL using SeriesId and season number
      return `${api.basePath}/Items/${currentItem.SeriesId}/Images/Primary?fillHeight=120&fillWidth=80&quality=96&tag=${currentItem.SeasonId}`;
    }

    // For non-episodes, use item's own poster
    return getPosterUrl(
      api.basePath,
      currentItem.Id,
      currentItem.ImageTags?.Primary,
      80,
      120,
    );
  }, [api?.basePath, currentItem]);

  if (!castDevice || !currentItem || !mediaStatus) {
    return null;
  }

  const progressPercent = duration > 0 ? (progress / duration) * 100 : 0;
  const protocolColor = "#a855f7"; // Streamyfin purple
  const TAB_BAR_HEIGHT = 80; // Standard tab bar height

  const handlePress = () => {
    router.push("/casting-player");
  };

  const handleTogglePlayPause = (e: any) => {
    e.stopPropagation();
    if (isPlaying) {
      remoteMediaClient?.pause();
    } else {
      remoteMediaClient?.play();
    }
  };

  return (
    <Animated.View
      entering={SlideInDown.duration(CASTING_CONSTANTS.ANIMATION_DURATION)}
      exiting={SlideOutDown.duration(CASTING_CONSTANTS.ANIMATION_DURATION)}
      style={{
        position: "absolute",
        bottom: TAB_BAR_HEIGHT + insets.bottom,
        left: 0,
        right: 0,
        backgroundColor: "#1a1a1a",
        borderTopWidth: 1,
        borderTopColor: "#333",
        zIndex: 100,
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
              <Ionicons name='tv' size={12} color={protocolColor} />
              <Text
                style={{
                  color: protocolColor,
                  fontSize: 11,
                }}
                numberOfLines={1}
              >
                {castDevice.friendlyName || "Chromecast"}
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
          <Pressable onPress={handleTogglePlayPause} style={{ padding: 8 }}>
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
