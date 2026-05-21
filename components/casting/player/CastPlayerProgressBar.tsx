/**
 * Casting Player Progress Bar
 * Progress slider with trickplay preview bubble and current/end time display.
 */

import { Image } from "expo-image";
import type { TFunction } from "i18next";
import { Dimensions, Text, View } from "react-native";
import { Slider } from "react-native-awesome-slider";
import type { RemoteMediaClient } from "react-native-google-cast";
import type { SharedValue } from "react-native-reanimated";
import type { useTrickplay } from "@/hooks/useTrickplay";
import {
  calculateEndingTime,
  formatTime,
  formatTrickplayTime,
} from "@/utils/casting/helpers";
import { msToTicks, ticksToSeconds } from "@/utils/time";

type TrickplayReturn = ReturnType<typeof useTrickplay>;

interface CastPlayerProgressBarProps {
  /** Shared value tracking the slider progress, in milliseconds. */
  sliderProgress: SharedValue<number>;
  /** Shared value for the slider minimum, in milliseconds. */
  sliderMin: SharedValue<number>;
  /** Shared value for the slider maximum, in milliseconds. */
  sliderMax: SharedValue<number>;
  /** Mutable ref flag set true while the user is scrubbing. */
  isScrubbing: { current: boolean };
  /** Current scrub percentage (0-1), used to position the trickplay bubble. */
  scrubPercentage: number;
  /** Updates the scrub percentage. */
  setScrubPercentage: (value: number) => void;
  /** Trickplay time display state for the bubble. */
  trickplayTime: { hours: number; minutes: number; seconds: number };
  /** Updates the trickplay time display state. */
  setTrickplayTime: (time: {
    hours: number;
    minutes: number;
    seconds: number;
  }) => void;
  /** Current trickplay image URL/coordinates, or null. */
  trickPlayUrl: TrickplayReturn["trickPlayUrl"];
  /** Computes the trickplay URL for a given progress in ticks. */
  calculateTrickplayUrl: TrickplayReturn["calculateTrickplayUrl"];
  /** Parsed trickplay metadata, or null. */
  trickplayInfo: TrickplayReturn["trickplayInfo"];
  /** Current playback progress, in seconds. */
  progress: number;
  /** Total media duration, in seconds. */
  duration: number;
  /** Remote media client, or null when no session. */
  remoteMediaClient: RemoteMediaClient | null;
  /** Theme color used for the slider track and bubbles. */
  protocolColor: string;
  /** Translation function. */
  t: TFunction;
}

export function CastPlayerProgressBar({
  sliderProgress,
  sliderMin,
  sliderMax,
  isScrubbing,
  scrubPercentage,
  setScrubPercentage,
  trickplayTime,
  setTrickplayTime,
  trickPlayUrl,
  calculateTrickplayUrl,
  trickplayInfo,
  progress,
  duration,
  remoteMediaClient,
  protocolColor,
  t,
}: CastPlayerProgressBarProps) {
  return (
    <>
      {/* Progress slider with trickplay preview */}
      <View style={{ marginTop: 8, height: 40 }}>
        <Slider
          style={{ width: "100%", height: 40 }}
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
            const durationMs = duration * 1000;
            if (durationMs > 0) {
              setScrubPercentage(value / durationMs);
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
                  console.error("[Casting Player] Seek error:", error);
                });
            }
          }}
          renderBubble={() => {
            // Calculate bubble position with edge clamping
            const screenWidth = Dimensions.get("window").width;
            const containerPadding = 20; // left/right padding of slider container (matches style)
            const thumbWidth = 16; // matches thumbWidth prop on Slider
            const sliderWidth = screenWidth - containerPadding * 2;
            // Adjust thumb position to account for thumb width affecting travel range
            const effectiveTrackWidth = sliderWidth - thumbWidth;
            const thumbPosition =
              thumbWidth / 2 + scrubPercentage * effectiveTrackWidth;

            if (!trickPlayUrl || !trickplayInfo) {
              // Show simple time bubble when no trickplay
              const timeBubbleWidth = 80;
              // Clamp position so bubble stays on screen
              // minLeft prevents going off left edge, maxLeft prevents going off right edge
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
                    bottom: 20,
                    left: clampedLeft,
                    backgroundColor: protocolColor,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 6,
                  }}
                >
                  <Text
                    style={{
                      color: "#fff",
                      fontSize: 14,
                      fontWeight: "600",
                    }}
                  >
                    {formatTrickplayTime(trickplayTime)}
                  </Text>
                </View>
              );
            }

            const { x, y, url } = trickPlayUrl;
            const tileWidth = 220; // Larger preview for casting player
            const tileHeight = tileWidth / (trickplayInfo.aspectRatio ?? 1.78);

            // Calculate clamped position for trickplay preview
            // minLeft: furthest left (when thumb is at left edge)
            // maxLeft: furthest right (when thumb is at right edge)
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
                  bottom: 20,
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
                    borderRadius: 8,
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
                    bottom: 4,
                    left: 4,
                    backgroundColor: "rgba(0, 0, 0, 0.7)",
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                    borderRadius: 4,
                  }}
                >
                  <Text
                    style={{
                      color: "#fff",
                      fontSize: 12,
                      fontWeight: "600",
                    }}
                  >
                    {formatTrickplayTime(trickplayTime)}
                  </Text>
                </View>
              </View>
            );
          }}
          sliderHeight={6}
          thumbWidth={16}
          panHitSlop={{ top: 30, bottom: 30, left: 10, right: 10 }}
        />
      </View>

      {/* Time display */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          marginBottom: 24,
        }}
      >
        <Text style={{ color: "#999", fontSize: 13 }}>
          {formatTime(progress * 1000)}
        </Text>
        <Text style={{ color: "#999", fontSize: 13 }}>
          {t("casting_player.ending_at", {
            time: calculateEndingTime(progress * 1000, duration * 1000),
          })}
        </Text>
        <Text style={{ color: "#999", fontSize: 13 }}>
          {formatTime(duration * 1000)}
        </Text>
      </View>
    </>
  );
}
