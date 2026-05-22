/**
 * Casting Player Progress Bar
 * Progress slider with trickplay preview bubble and current/end time display.
 */

import type { ChapterInfo } from "@jellyfin/sdk/lib/generated-client/models";
import type { TFunction } from "i18next";
import { Text, View } from "react-native";
import { Slider } from "react-native-awesome-slider";
import type { RemoteMediaClient } from "react-native-google-cast";
import type { SharedValue } from "react-native-reanimated";
import { CastTrickplayBubble } from "@/components/casting/player/CastTrickplayBubble";
import { ChapterTicks } from "@/components/chapters/ChapterTicks";
import type { useTrickplay } from "@/hooks/useTrickplay";
import { calculateEndingTime, formatTime } from "@/utils/casting/helpers";
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
  /** Chapter markers for the current item, or null/undefined if none. */
  chapters?: ChapterInfo[] | null;
  /** Translation function. */
  t: TFunction;
}

export function CastPlayerProgressBar({
  sliderProgress,
  sliderMin,
  sliderMax,
  isScrubbing,
  trickplayTime,
  setTrickplayTime,
  trickPlayUrl,
  calculateTrickplayUrl,
  trickplayInfo,
  progress,
  duration,
  remoteMediaClient,
  protocolColor,
  chapters,
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
          renderBubble={() => (
            <CastTrickplayBubble
              trickPlayUrl={trickPlayUrl}
              trickplayInfo={trickplayInfo}
              trickplayTime={trickplayTime}
              tileWidth={220}
            />
          )}
          bubbleMaxWidth={220}
          bubbleWidth={220}
          bubbleTranslateY={-20}
          sliderHeight={6}
          thumbWidth={16}
          panHitSlop={{ top: 12, bottom: 12, left: 10, right: 10 }}
        />
        <ChapterTicks
          chapters={chapters}
          durationMs={duration * 1000}
          height={4}
          color='#cccccc'
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
