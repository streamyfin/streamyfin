import type React from "react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  TouchableOpacity,
  type TouchableOpacityProps,
  View,
} from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Text } from "@/components/common/Text";
import { Colors } from "@/constants/Colors";
import { CONTROLS_CONSTANTS } from "./constants";

interface NextEpisodeCountDownButtonProps extends TouchableOpacityProps {
  onFinish?: () => void;
  onPress?: () => void;
  show: boolean;
  // When false, the button is shown as a plain tap target with no fill
  // animation and never auto-advances — used when the trigger that revealed
  // it (e.g. credits-segment metadata) isn't reliable enough to act on
  // without the user confirming.
  autoAdvance?: boolean;
  /** Media time left in the current item, in milliseconds. */
  remainingMs: number;
  isPlaying: boolean;
  /** Id of the item being played, to scope the countdown to it. */
  itemId?: string | null;
}

/** Media time the fill represents, matching the window the button appears in. */
const COUNTDOWN_WINDOW_MS = CONTROLS_CONSTANTS.NEXT_EPISODE_COUNTDOWN_MS;
/**
 * The player reports its position about once a second, so the last sample of
 * an item can sit that far short of the end. Anything inside this window is
 * the end of the item.
 */
const END_OF_ITEM_MS = 1000;
/** One position sample: the interval a single fill step has to cover. */
const SAMPLE_MS = 1000;

const NextEpisodeCountDownButton: React.FC<NextEpisodeCountDownButtonProps> = ({
  onFinish,
  onPress,
  show,
  autoAdvance = true,
  remainingMs,
  isPlaying,
  itemId,
  ...props
}) => {
  const progress = useSharedValue(0);
  // Advancing is one-way per appearance: without this, any re-render inside
  // the end-of-item window would navigate again.
  const hasAdvancedRef = useRef(false);
  // The remaining time is only trustworthy once the player has reported a
  // position for the item on screen. Until then it still describes the
  // previous episode, which reads as "one second left" the moment the next one
  // starts and would chain through a whole season. Advancing waits for a
  // sample that is clearly not the end.
  const hasSeenItemRunningRef = useRef(false);
  const countedItemRef = useRef(itemId);

  // Fill from the item's own clock rather than from a countdown of its own.
  // A timer has to be told about everything that happens to playback: it
  // drifts as soon as the speed is not 1x, keeps running while playback is
  // paused, and ignores seeks. The remaining time already covers all three.
  const target =
    show && autoAdvance
      ? Math.min(Math.max(1 - remainingMs / COUNTDOWN_WINDOW_MS, 0), 1)
      : 0;

  useEffect(() => {
    if (!show) {
      cancelAnimation(progress);
      progress.value = 0;
      hasAdvancedRef.current = false;
      return;
    }

    // Pausing freezes the fill where it stands. Without cancelling, the tween
    // already in flight would keep creeping for up to a sample after playback
    // stopped.
    if (!isPlaying) {
      cancelAnimation(progress);
      return;
    }

    // Reach for the next sample instead of jumping to it, so the fill moves
    // smoothly between two position reports. Paused playback stops moving the
    // target, which leaves the fill where it is instead of emptying it.
    progress.value = withTiming(target, {
      duration: SAMPLE_MS,
      easing: Easing.linear,
    });

    // Cancel on unmount so nothing keeps animating after the player is gone.
    return () => {
      cancelAnimation(progress);
    };
  }, [show, target, progress, isPlaying]);

  useEffect(() => {
    if (countedItemRef.current !== itemId) {
      countedItemRef.current = itemId;
      hasSeenItemRunningRef.current = false;
      hasAdvancedRef.current = false;
    }
    if (remainingMs > END_OF_ITEM_MS) hasSeenItemRunningRef.current = true;

    if (!show || !autoAdvance || !onFinish) return;
    if (hasAdvancedRef.current || !hasSeenItemRunningRef.current) return;
    // Android keeps the player open at the end of a file, so it pauses itself
    // there instead of reporting a position past the end. Treat a pause inside
    // the last sample as the end of the item, and keep the plain check for
    // players that do report past the item's duration.
    const reachedEnd = remainingMs <= 0;
    const stoppedAtEnd = !isPlaying && remainingMs <= END_OF_ITEM_MS;
    if (!reachedEnd && !stoppedAtEnd) return;
    hasAdvancedRef.current = true;
    onFinish();
  }, [show, autoAdvance, remainingMs, isPlaying, itemId, onFinish]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      position: "absolute",
      left: 0,
      top: 0,
      bottom: 0,
      width: `${progress.value * 100}%`,
      backgroundColor: Colors.primary,
    };
  });

  const handlePress = () => {
    if (onPress) {
      onPress();
    }
  };

  const { t } = useTranslation();

  if (!show) {
    return null;
  }

  return (
    <TouchableOpacity
      className='w-32 overflow-hidden rounded-md bg-black/60 border border-neutral-900'
      {...props}
      onPress={handlePress}
    >
      <Animated.View style={animatedStyle} />
      <View className='px-3 py-2'>
        <Text numberOfLines={1} className='text-center text-sm font-bold'>
          {t("player.next_episode")}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

export default NextEpisodeCountDownButton;
