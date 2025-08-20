import { useCallback, useRef, useState } from "react";
import {
  runOnJS,
  type SharedValue,
  useAnimatedReaction,
} from "react-native-reanimated";
import { ticksToSeconds } from "@/utils/time";

interface UseVideoTimeProps {
  progress: SharedValue<number>;
  max: SharedValue<number>;
  isSeeking: SharedValue<boolean>;
  isVlc: boolean;
}

export function useVideoTime({
  progress,
  max,
  isSeeking,
  isVlc,
}: UseVideoTimeProps) {
  const [currentTime, setCurrentTime] = useState(0);
  const [remainingTime, setRemainingTime] = useState(Number.POSITIVE_INFINITY);

  const lastCurrentTimeRef = useRef(0);
  const lastRemainingTimeRef = useRef(0);

  const updateTimes = useCallback(
    (currentProgress: number, maxValue: number) => {
      const current = isVlc ? currentProgress : ticksToSeconds(currentProgress);
      const remaining = isVlc
        ? maxValue - currentProgress
        : ticksToSeconds(maxValue - currentProgress);

      // Only update state if the displayed time actually changed (avoid sub-second updates)
      const currentSeconds = Math.floor(current / (isVlc ? 1000 : 1));
      const remainingSeconds = Math.floor(remaining / (isVlc ? 1000 : 1));
      const lastCurrentSeconds = Math.floor(
        lastCurrentTimeRef.current / (isVlc ? 1000 : 1),
      );
      const lastRemainingSeconds = Math.floor(
        lastRemainingTimeRef.current / (isVlc ? 1000 : 1),
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
    [isVlc],
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
