import { debounce } from "lodash";
import { useCallback, useRef, useState } from "react";
import type { SharedValue } from "react-native-reanimated";
import { msToTicks, ticksToSeconds } from "@/utils/time";
import { CONTROLS_CONSTANTS } from "../constants";

interface UseVideoSliderProps {
  progress: SharedValue<number>;
  isSeeking: SharedValue<boolean>;
  isPlaying: boolean;
  seek: (value: number) => void;
  play: () => void;
  pause: () => void;
  calculateTrickplayUrl: (progressInTicks: number) => void;
  showControls: boolean;
}

/**
 * Hook to manage video slider interactions.
 * MPV player uses milliseconds for time values.
 */
export function useVideoSlider({
  progress,
  isSeeking,
  isPlaying,
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
      // MPV uses ms, seek expects ms
      const seekValue = Math.max(0, Math.floor(value));
      seek(seekValue);
      if (wasPlayingRef.current) {
        play();
      }
    },
    [seek, play, progress, isSeeking],
  );

  const handleSliderChange = useCallback(
    debounce((value: number) => {
      // Convert ms to ticks for trickplay
      const progressInTicks = msToTicks(value);
      calculateTrickplayUrl(progressInTicks);
      const progressInSeconds = Math.floor(ticksToSeconds(progressInTicks));
      const hours = Math.floor(progressInSeconds / 3600);
      const minutes = Math.floor((progressInSeconds % 3600) / 60);
      const seconds = progressInSeconds % 60;
      setTime({ hours, minutes, seconds });
    }, CONTROLS_CONSTANTS.SLIDER_DEBOUNCE_MS),
    [calculateTrickplayUrl],
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
