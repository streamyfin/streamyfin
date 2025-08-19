import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { debounce } from "lodash";
import { useCallback, useRef, useState } from "react";
import {
  type SharedValue,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useTrickplay } from "@/hooks/useTrickplay";
import { msToTicks, ticksToSeconds } from "@/utils/time";

interface UseSliderInteractionsProps {
  progress: SharedValue<number>;
  isSeeking: SharedValue<boolean>;
  isPlaying: boolean;
  isVlc: boolean;
  showControls: boolean;
  item: BaseItemDto;
  seek: (ticks: number) => void;
  play: () => void;
  pause: () => void;
}

export const useSliderInteractions = ({
  progress,
  isSeeking,
  isPlaying,
  isVlc,
  showControls,
  item,
  seek,
  play,
  pause,
}: UseSliderInteractionsProps) => {
  const [isSliding, setIsSliding] = useState(false);
  const [time, setTime] = useState({ hours: 0, minutes: 0, seconds: 0 });

  const wasPlayingRef = useRef(false);
  const lastProgressRef = useRef<number>(0);

  // Animated scale for slider
  const sliderScale = useSharedValue(1);

  const { calculateTrickplayUrl } = useTrickplay(item);

  const handleSliderStart = useCallback(() => {
    if (!showControls) {
      return;
    }

    setIsSliding(true);
    wasPlayingRef.current = isPlaying;
    lastProgressRef.current = progress.value;

    pause();
    isSeeking.value = true;
  }, [showControls, isPlaying, pause]);

  const handleTouchStart = useCallback(() => {
    if (!showControls) {
      return;
    }

    // Scale up the slider immediately on touch
    sliderScale.value = withTiming(1.4, { duration: 300 });
  }, [showControls]);

  const handleTouchEnd = useCallback(() => {
    if (!showControls) {
      return;
    }

    // Scale down the slider on touch end (only if not sliding, to avoid conflict with onSlidingComplete)
    if (!isSliding) {
      sliderScale.value = withTiming(1.0, { duration: 300 });
    }
  }, [showControls, isSliding]);

  const handleSliderComplete = useCallback(
    async (value: number) => {
      isSeeking.value = false;
      progress.value = value;
      setIsSliding(false);

      // Scale down the slider
      sliderScale.value = withTiming(1.0, { duration: 200 });

      seek(Math.max(0, Math.floor(isVlc ? value : ticksToSeconds(value))));
      if (wasPlayingRef.current) {
        play();
      }
    },
    [isVlc, seek, play],
  );

  const handleSliderChange = useCallback(
    debounce((value: number) => {
      const progressInTicks = isVlc ? msToTicks(value) : value;
      calculateTrickplayUrl(progressInTicks);
      const progressInSeconds = Math.floor(ticksToSeconds(progressInTicks));
      const hours = Math.floor(progressInSeconds / 3600);
      const minutes = Math.floor((progressInSeconds % 3600) / 60);
      const seconds = progressInSeconds % 60;
      setTime({ hours, minutes, seconds });
    }, 3),
    [isVlc, calculateTrickplayUrl],
  );

  return {
    isSliding,
    setIsSliding,
    time,
    sliderScale,
    handleSliderStart,
    handleTouchStart,
    handleTouchEnd,
    handleSliderComplete,
    handleSliderChange,
  };
};
