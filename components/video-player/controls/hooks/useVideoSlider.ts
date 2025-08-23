import { debounce } from "lodash";
import { useCallback, useRef, useState } from "react";
import type { SharedValue } from "react-native-reanimated";
import { msToTicks, ticksToSeconds } from "@/utils/time";
import { CONTROLS_CONSTANTS } from "../constants";

interface UseVideoSliderProps {
  progress: SharedValue<number>;
  isSeeking: SharedValue<boolean>;
  isPlaying: boolean;
  isVlc: boolean;
  seek: (value: number) => void;
  play: () => void;
  pause: () => void;
  calculateTrickplayUrl: (progressInTicks: number) => void;
  showControls: boolean;
}

export function useVideoSlider({
  progress,
  isSeeking,
  isPlaying,
  isVlc,
  seek,
  play,
  pause,
  calculateTrickplayUrl,
  showControls,
}: UseVideoSliderProps) {
  const [isSliding, setIsSliding] = useState(false);
  const [time, setTime] = useState({ hours: 0, minutes: 0, seconds: 0 });
  const wasPlayingRef = useRef(false);
  const lastProgressRef = useRef<number>(0);

  const handleSliderStart = useCallback(() => {
    if (!showControls) {
      return;
    }

    setIsSliding(true);
    wasPlayingRef.current = isPlaying;
    lastProgressRef.current = progress.value;

    pause();
    isSeeking.value = true;
  }, [showControls, isPlaying, pause, progress, isSeeking]);

  const handleTouchStart = useCallback(() => {
    if (!showControls) {
      return;
    }
  }, [showControls]);

  const handleTouchEnd = useCallback(() => {
    if (!showControls) {
      return;
    }
  }, [showControls]);

  const handleSliderComplete = useCallback(
    async (value: number) => {
      setIsSliding(false);
      isSeeking.value = false;
      progress.value = value;
      const seekValue = Math.max(
        0,
        Math.floor(isVlc ? value : ticksToSeconds(value)),
      );
      seek(seekValue);
      if (wasPlayingRef.current) {
        play();
      }
    },
    [isVlc, seek, play, progress, isSeeking],
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
    }, CONTROLS_CONSTANTS.SLIDER_DEBOUNCE_MS),
    [isVlc, calculateTrickplayUrl],
  );

  return {
    isSliding,
    time,
    handleSliderStart,
    handleTouchStart,
    handleTouchEnd,
    handleSliderComplete,
    handleSliderChange,
  };
}
