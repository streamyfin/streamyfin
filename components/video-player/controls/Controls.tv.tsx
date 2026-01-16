import { Ionicons } from "@expo/vector-icons";
import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client";
import { type FC, useCallback, useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { Slider } from "react-native-awesome-slider";
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/common/Text";
import { useTrickplay } from "@/hooks/useTrickplay";
import { formatTimeString, ticksToMs } from "@/utils/time";
import { CONTROLS_CONSTANTS } from "./constants";
import { useRemoteControl } from "./hooks/useRemoteControl";
import { useVideoSlider } from "./hooks/useVideoSlider";
import { useVideoTime } from "./hooks/useVideoTime";
import { TrickplayBubble } from "./TrickplayBubble";
import { useControlsTimeout } from "./useControlsTimeout";

interface Props {
  item: BaseItemDto;
  isPlaying: boolean;
  isSeeking: SharedValue<boolean>;
  cacheProgress: SharedValue<number>;
  progress: SharedValue<number>;
  isBuffering?: boolean;
  showControls: boolean;
  togglePlay: () => void;
  setShowControls: (shown: boolean) => void;
  mediaSource?: MediaSourceInfo | null;
  seek: (ticks: number) => void;
  play: () => void;
  pause: () => void;
}

const TV_SEEKBAR_HEIGHT = 16;
const TV_AUTO_HIDE_TIMEOUT = 5000;

export const Controls: FC<Props> = ({
  item,
  seek,
  play,
  pause,
  togglePlay,
  isPlaying,
  isSeeking,
  progress,
  cacheProgress,
  showControls,
  setShowControls,
}) => {
  const insets = useSafeAreaInsets();

  const {
    trickPlayUrl,
    calculateTrickplayUrl,
    trickplayInfo,
    prefetchAllTrickplayImages,
  } = useTrickplay(item);

  const min = useSharedValue(0);
  const maxMs = ticksToMs(item.RunTimeTicks || 0);
  const max = useSharedValue(maxMs);

  // Animation values for controls
  const controlsOpacity = useSharedValue(showControls ? 1 : 0);
  const bottomTranslateY = useSharedValue(showControls ? 0 : 50);

  useEffect(() => {
    prefetchAllTrickplayImages();
  }, [prefetchAllTrickplayImages]);

  // Animate controls visibility
  useEffect(() => {
    const animationConfig = {
      duration: 300,
      easing: Easing.out(Easing.quad),
    };

    controlsOpacity.value = withTiming(showControls ? 1 : 0, animationConfig);
    bottomTranslateY.value = withTiming(showControls ? 0 : 30, animationConfig);
  }, [showControls, controlsOpacity, bottomTranslateY]);

  // Create animated style for bottom controls
  const bottomAnimatedStyle = useAnimatedStyle(() => ({
    opacity: controlsOpacity.value,
    transform: [{ translateY: bottomTranslateY.value }],
  }));

  // Initialize progress values
  useEffect(() => {
    if (item) {
      progress.value = ticksToMs(item?.UserData?.PlaybackPositionTicks);
      max.value = ticksToMs(item.RunTimeTicks || 0);
    }
  }, [item, progress, max]);

  // Time management hook
  const { currentTime, remainingTime } = useVideoTime({
    progress,
    max,
    isSeeking,
  });

  const toggleControls = useCallback(() => {
    setShowControls(!showControls);
  }, [showControls, setShowControls]);

  // Long press seek handlers for continuous seeking
  const handleSeekForward = useCallback(
    (seconds: number) => {
      const newPosition = Math.min(max.value, progress.value + seconds * 1000);
      progress.value = newPosition;
      seek(newPosition);
    },
    [progress, max, seek],
  );

  const handleSeekBackward = useCallback(
    (seconds: number) => {
      const newPosition = Math.max(min.value, progress.value - seconds * 1000);
      progress.value = newPosition;
      seek(newPosition);
    },
    [progress, min, seek],
  );

  // Remote control hook for TV navigation
  const {
    remoteScrubProgress,
    isRemoteScrubbing,
    showRemoteBubble,
    isSliding: isRemoteSliding,
    time: remoteTime,
  } = useRemoteControl({
    progress,
    min,
    max,
    showControls,
    isPlaying,
    seek,
    play,
    togglePlay,
    toggleControls,
    calculateTrickplayUrl,
    handleSeekForward,
    handleSeekBackward,
  });

  // Slider hook
  const {
    isSliding,
    time,
    handleSliderStart,
    handleTouchStart,
    handleTouchEnd,
    handleSliderComplete,
    handleSliderChange,
  } = useVideoSlider({
    progress,
    isSeeking,
    isPlaying,
    seek,
    play,
    pause,
    calculateTrickplayUrl,
    showControls,
  });

  const effectiveProgress = useSharedValue(0);

  // Recompute progress for remote scrubbing
  useAnimatedReaction(
    () => ({
      isScrubbing: isRemoteScrubbing.value,
      scrub: remoteScrubProgress.value,
      actual: progress.value,
    }),
    (current, previous) => {
      if (
        current.isScrubbing !== previous?.isScrubbing ||
        current.isScrubbing
      ) {
        effectiveProgress.value =
          current.isScrubbing && current.scrub != null
            ? current.scrub
            : current.actual;
      } else {
        const progressUnit = CONTROLS_CONSTANTS.PROGRESS_UNIT_MS;
        const progressDiff = Math.abs(current.actual - effectiveProgress.value);
        if (progressDiff >= progressUnit) {
          effectiveProgress.value = current.actual;
        }
      }
    },
    [],
  );

  const hideControls = useCallback(() => {
    setShowControls(false);
  }, [setShowControls]);

  const { handleControlsInteraction } = useControlsTimeout({
    showControls,
    isSliding: isSliding || isRemoteSliding,
    episodeView: false,
    onHideControls: hideControls,
    timeout: TV_AUTO_HIDE_TIMEOUT,
    disabled: false,
  });

  return (
    <View style={styles.controlsContainer} pointerEvents='box-none'>
      {/* Center Play Button - shown when paused */}
      {!isPlaying && showControls && (
        <View style={styles.centerContainer}>
          <View style={styles.playButtonContainer}>
            <Ionicons name='play' size={80} color='white' />
          </View>
        </View>
      )}

      <Animated.View
        style={[styles.bottomContainer, bottomAnimatedStyle]}
        pointerEvents={showControls ? "auto" : "none"}
      >
        <View
          style={[
            styles.bottomInner,
            {
              paddingRight: Math.max(insets.right, 48),
              paddingLeft: Math.max(insets.left, 48),
              paddingBottom: Math.max(insets.bottom, 24),
            },
          ]}
          onTouchStart={handleControlsInteraction}
        >
          {/* Metadata */}
          <View style={styles.metadataContainer}>
            {item?.Type === "Episode" && (
              <Text style={styles.subtitleText}>
                {`${item.SeriesName} - ${item.SeasonName} Episode ${item.IndexNumber}`}
              </Text>
            )}
            <Text style={styles.titleText}>{item?.Name}</Text>
            {item?.Type === "Movie" && (
              <Text style={styles.subtitleText}>{item?.ProductionYear}</Text>
            )}
          </View>

          {/* Large Seekbar */}
          <View
            style={styles.sliderContainer}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <Slider
              theme={{
                maximumTrackTintColor: "rgba(255,255,255,0.2)",
                minimumTrackTintColor: "#fff",
                cacheTrackTintColor: "rgba(255,255,255,0.3)",
                bubbleBackgroundColor: "#fff",
                bubbleTextColor: "#666",
                heartbeatColor: "#999",
              }}
              renderThumb={() => null}
              cache={cacheProgress}
              onSlidingStart={handleSliderStart}
              onSlidingComplete={handleSliderComplete}
              onValueChange={handleSliderChange}
              containerStyle={styles.sliderTrack}
              renderBubble={() =>
                (isSliding || showRemoteBubble) && (
                  <TrickplayBubble
                    trickPlayUrl={trickPlayUrl}
                    trickplayInfo={trickplayInfo}
                    time={time}
                  />
                )
              }
              sliderHeight={TV_SEEKBAR_HEIGHT}
              thumbWidth={0}
              progress={effectiveProgress}
              minimumValue={min}
              maximumValue={max}
            />
          </View>

          {/* Time Display - TV sized */}
          <View style={styles.timeContainer}>
            <Text style={styles.timeText}>
              {formatTimeString(currentTime, "ms")}
            </Text>
            <Text style={styles.timeText}>
              -{formatTimeString(remainingTime, "ms")}
            </Text>
          </View>
        </View>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  controlsContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  centerContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  playButtonContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    paddingLeft: 8,
  },
  bottomContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  bottomInner: {
    flexDirection: "column",
  },
  metadataContainer: {
    marginBottom: 16,
  },
  subtitleText: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 18,
  },
  titleText: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "bold",
  },
  sliderContainer: {
    height: TV_SEEKBAR_HEIGHT,
    justifyContent: "center",
    alignItems: "stretch",
  },
  sliderTrack: {
    borderRadius: 100,
  },
  timeContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
  },
  timeText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 22,
  },
});
