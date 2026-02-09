/**
 * Unified Casting Mini Player
 * Works with all supported casting protocols
 */

import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useAtomValue } from "jotai";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Dimensions, Pressable, View } from "react-native";
import { Slider } from "react-native-awesome-slider";
import {
  MediaPlayerState,
  useCastDevice,
  useMediaStatus,
  useRemoteMediaClient,
} from "react-native-google-cast";
import Animated, {
  SlideInDown,
  SlideOutDown,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/common/Text";
import { useTrickplay } from "@/hooks/useTrickplay";
import { apiAtom } from "@/providers/JellyfinProvider";
import {
  formatTime,
  formatTrickplayTime,
  getPosterUrl,
} from "@/utils/casting/helpers";
import { CASTING_CONSTANTS } from "@/utils/casting/types";
import { msToTicks, ticksToSeconds } from "@/utils/time";

export const CastingMiniPlayer: React.FC = () => {
  const api = useAtomValue(apiAtom);
  const insets = useSafeAreaInsets();
  const castDevice = useCastDevice();
  const mediaStatus = useMediaStatus();
  const remoteMediaClient = useRemoteMediaClient();

  const currentItem = useMemo(() => {
    return mediaStatus?.mediaInfo?.customData as BaseItemDto | undefined;
  }, [mediaStatus?.mediaInfo?.customData]);

  // Trickplay support - pass currentItem as BaseItemDto or null
  const { trickPlayUrl, calculateTrickplayUrl, trickplayInfo } = useTrickplay(
    currentItem || null,
  );
  const [trickplayTime, setTrickplayTime] = useState({
    hours: 0,
    minutes: 0,
    seconds: 0,
  });
  const [scrubPercentage, setScrubPercentage] = useState(0);
  const isScrubbing = useRef(false);

  // Slider shared values
  const sliderProgress = useSharedValue(0);
  const sliderMin = useSharedValue(0);
  const sliderMax = useSharedValue(100);

  // Live progress state that updates every second when playing
  const [liveProgress, setLiveProgress] = useState(
    mediaStatus?.streamPosition || 0,
  );

  // Track baseline for elapsed-time computation
  const baselinePositionRef = useRef(mediaStatus?.streamPosition || 0);
  const baselineTimestampRef = useRef(Date.now());

  // Sync live progress with mediaStatus and poll every second when playing
  useEffect(() => {
    // Resync baseline whenever mediaStatus reports a new position
    if (mediaStatus?.streamPosition !== undefined) {
      baselinePositionRef.current = mediaStatus.streamPosition;
      baselineTimestampRef.current = Date.now();
      setLiveProgress(mediaStatus.streamPosition);
    }

    // Update based on elapsed real time when playing
    const interval = setInterval(() => {
      if (mediaStatus?.playerState === MediaPlayerState.PLAYING) {
        const elapsed =
          ((Date.now() - baselineTimestampRef.current) *
            (mediaStatus.playbackRate || 1)) /
          1000;
        setLiveProgress(baselinePositionRef.current + elapsed);
      } else if (mediaStatus?.streamPosition !== undefined) {
        // Sync with actual position when paused/buffering
        baselinePositionRef.current = mediaStatus.streamPosition;
        baselineTimestampRef.current = Date.now();
        setLiveProgress(mediaStatus.streamPosition);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [
    mediaStatus?.playerState,
    mediaStatus?.streamPosition,
    mediaStatus?.playbackRate,
  ]);

  const progress = liveProgress * 1000; // Convert to ms
  const duration = (mediaStatus?.mediaInfo?.streamDuration || 0) * 1000;
  const isPlaying = mediaStatus?.playerState === MediaPlayerState.PLAYING;

  // Update slider max value when duration changes
  useEffect(() => {
    if (duration > 0) {
      sliderMax.value = duration;
    }
  }, [duration, sliderMax]);

  // Sync slider progress with live progress (when not scrubbing)
  useEffect(() => {
    if (!isScrubbing.current && progress >= 0) {
      sliderProgress.value = progress;
    }
  }, [progress, sliderProgress]);

  // For episodes, use series poster; for other content, use item poster
  const posterUrl = useMemo(() => {
    if (!api?.basePath || !currentItem) return null;

    if (
      currentItem.Type === "Episode" &&
      currentItem.SeriesId &&
      currentItem.ParentIndexNumber !== undefined &&
      currentItem.SeasonId
    ) {
      // Build series poster URL using SeriesId and series-level image tag
      const imageTag = currentItem.SeriesPrimaryImageTag || "";
      const tagParam = imageTag ? `&tag=${imageTag}` : "";
      return `${api.basePath}/Items/${currentItem.SeriesId}/Images/Primary?fillHeight=120&fillWidth=80&quality=96${tagParam}`;
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

  // Hide mini player when:
  // - No cast device connected
  // - No media info (currentItem)
  // - No media status
  // - Media is stopped (IDLE state)
  // - Media is unknown state
  const playerState = mediaStatus?.playerState;
  const isMediaStopped = playerState === MediaPlayerState.IDLE;

  if (!castDevice || !currentItem || !mediaStatus || isMediaStopped) {
    return null;
  }

  const protocolColor = "#a855f7"; // Streamyfin purple
  const TAB_BAR_HEIGHT = 80; // Standard tab bar height

  const handlePress = () => {
    router.push("/casting-player");
  };

  const handleTogglePlayPause = () => {
    if (isPlaying) {
      remoteMediaClient?.pause()?.catch((error: unknown) => {
        console.error("[CastingMiniPlayer] Pause error:", error);
      });
    } else {
      remoteMediaClient?.play()?.catch((error: unknown) => {
        console.error("[CastingMiniPlayer] Play error:", error);
      });
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
      {/* Interactive progress slider with trickplay */}
      <View style={{ paddingHorizontal: 8, paddingTop: 4 }}>
        <Slider
          style={{ width: "100%", height: 20 }}
          progress={sliderProgress}
          minimumValue={sliderMin}
          maximumValue={sliderMax}
          theme={{
            maximumTrackTintColor: "#333",
            minimumTrackTintColor: protocolColor,
            bubbleBackgroundColor: protocolColor,
            bubbleTextColor: "#fff",
          }}
          onSlidingStart={() => {
            isScrubbing.current = true;
          }}
          onValueChange={(value) => {
            // Calculate trickplay preview
            const progressInTicks = msToTicks(value);
            calculateTrickplayUrl(progressInTicks);

            // Update time display for trickplay bubble
            const progressInSeconds = Math.floor(
              ticksToSeconds(progressInTicks),
            );
            const hours = Math.floor(progressInSeconds / 3600);
            const minutes = Math.floor((progressInSeconds % 3600) / 60);
            const seconds = progressInSeconds % 60;
            setTrickplayTime({ hours, minutes, seconds });

            // Track scrub percentage for bubble positioning
            if (duration > 0) {
              setScrubPercentage(value / duration);
            }
          }}
          onSlidingComplete={(value) => {
            isScrubbing.current = false;
            // Seek to the position (value is in milliseconds, convert to seconds)
            const positionSeconds = value / 1000;
            if (remoteMediaClient && duration > 0) {
              remoteMediaClient
                .seek({ position: positionSeconds })
                .catch((error) => {
                  console.error("[Mini Player] Seek error:", error);
                });
            }
          }}
          renderBubble={() => {
            // Calculate bubble position with edge clamping
            const screenWidth = Dimensions.get("window").width;
            const sliderPadding = 8;
            const thumbWidth = 10; // matches thumbWidth prop on Slider
            const sliderWidth = screenWidth - sliderPadding * 2;
            // Adjust thumb position to account for thumb width affecting travel range
            const effectiveTrackWidth = sliderWidth - thumbWidth;
            const thumbPosition =
              thumbWidth / 2 + scrubPercentage * effectiveTrackWidth;

            if (!trickPlayUrl || !trickplayInfo) {
              // Show simple time bubble when no trickplay
              const timeBubbleWidth = 70;
              const minLeft = -thumbPosition;
              const maxLeft = sliderWidth - thumbPosition - timeBubbleWidth;
              const centeredLeft = -timeBubbleWidth / 2;
              const clampedLeft = Math.max(
                minLeft,
                Math.min(maxLeft, centeredLeft),
              );

              return (
                <View
                  style={{
                    position: "absolute",
                    bottom: 12,
                    left: clampedLeft,
                    backgroundColor: protocolColor,
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: 4,
                  }}
                >
                  <Text
                    style={{ color: "#fff", fontSize: 11, fontWeight: "600" }}
                  >
                    {formatTrickplayTime(trickplayTime)}
                  </Text>
                </View>
              );
            }

            const { x, y, url } = trickPlayUrl;
            const tileWidth = 140; // Smaller preview for mini player
            const tileHeight = tileWidth / (trickplayInfo.aspectRatio ?? 1.78);

            // Calculate clamped position for trickplay preview
            const minLeft = -thumbPosition;
            const maxLeft = sliderWidth - thumbPosition - tileWidth;
            const centeredLeft = -tileWidth / 2;
            const clampedLeft = Math.max(
              minLeft,
              Math.min(maxLeft, centeredLeft),
            );

            return (
              <View
                style={{
                  position: "absolute",
                  bottom: 12,
                  left: clampedLeft,
                  width: tileWidth,
                  alignItems: "center",
                }}
              >
                {/* Trickplay image preview */}
                <View
                  style={{
                    width: tileWidth,
                    height: tileHeight,
                    borderRadius: 6,
                    overflow: "hidden",
                    backgroundColor: "#1a1a1a",
                  }}
                >
                  <Image
                    cachePolicy='memory-disk'
                    style={{
                      width: tileWidth * (trickplayInfo.data?.TileWidth ?? 1),
                      height:
                        (tileWidth / (trickplayInfo.aspectRatio ?? 1.78)) *
                        (trickplayInfo.data?.TileHeight ?? 1),
                      transform: [
                        { translateX: -x * tileWidth },
                        { translateY: -y * tileHeight },
                      ],
                    }}
                    source={{ uri: url }}
                    contentFit='cover'
                  />
                </View>
                {/* Time overlay */}
                <View
                  style={{
                    position: "absolute",
                    bottom: 2,
                    left: 2,
                    backgroundColor: "rgba(0, 0, 0, 0.7)",
                    paddingHorizontal: 4,
                    paddingVertical: 1,
                    borderRadius: 3,
                  }}
                >
                  <Text
                    style={{ color: "#fff", fontSize: 10, fontWeight: "600" }}
                  >
                    {formatTrickplayTime(trickplayTime)}
                  </Text>
                </View>
              </View>
            );
          }}
          sliderHeight={3}
          thumbWidth={10}
          panHitSlop={{ top: 20, bottom: 20, left: 5, right: 5 }}
        />
      </View>

      <Pressable onPress={handlePress}>
        {/* Content */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            padding: 12,
            paddingTop: 6,
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
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              handleTogglePlayPause();
            }}
            style={{ padding: 8 }}
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
