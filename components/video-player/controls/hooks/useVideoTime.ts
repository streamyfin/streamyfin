import { useCallback, useRef, useState } from "react";
import {
  runOnJS,
  type SharedValue,
  useAnimatedReaction,
} from "react-native-reanimated";

interface UseVideoTimeProps {
  progress: SharedValue<number>;
  max: SharedValue<number>;
  isSeeking: SharedValue<boolean>;
}

/**
 * Hook to manage video time display.
 * MPV player uses milliseconds for time values.
 */
export function useVideoTime({ progress, max, isSeeking }: UseVideoTimeProps) {
  const [currentTime, setCurrentTime] = useState(0);
  const [remainingTime, setRemainingTime] = useState(Number.POSITIVE_INFINITY);

  const lastCurrentTimeRef = useRef(0);
  const lastRemainingTimeRef = useRef(0);

  const updateTimes = useCallback(
    (currentProgress: number, maxValue: number) => {
      // MPV uses milliseconds
      const current = currentProgress;
      const remaining = maxValue - currentProgress;

      // Only update state if the displayed time actually changed (avoid sub-second updates)
      const currentSeconds = Math.floor(current / 1000);
      const remainingSeconds = Math.floor(remaining / 1000);
      const lastCurrentSeconds = Math.floor(lastCurrentTimeRef.current / 1000);
      const lastRemainingSeconds = Math.floor(
        lastRemainingTimeRef.current / 1000,
      );

      if (
        currentSeconds !== lastCurrentSeconds ||
        remainingSeconds !== lastRemainingSeconds
      ) {
        setCurrentTime(current);
        setRemainingTime(remaining);
        lastCurrentTimeRef.current = current;
        lastRemainingTimeRef.current = remaining;
      }
    },
    [],
  );

  useAnimatedReaction(
    () => ({
      progress: progress.value,
      max: max.value,
      isSeeking: isSeeking.value,
    }),
    (result) => {
      if (!result.isSeeking) {
        runOnJS(updateTimes)(result.progress, result.max);
      }
    },
    [updateTimes],
  );

  return {
    currentTime,
    remainingTime,
  };
}
