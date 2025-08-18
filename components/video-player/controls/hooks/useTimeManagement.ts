import { useCallback, useState } from "react";
import {
  runOnJS,
  type SharedValue,
  useAnimatedReaction,
} from "react-native-reanimated";
import { ticksToSeconds } from "@/utils/time";

interface UseTimeManagementProps {
  progress: SharedValue<number>;
  max: SharedValue<number>;
  isSeeking: SharedValue<boolean>;
  isVlc: boolean;
}

export const useTimeManagement = ({
  progress,
  max,
  isSeeking,
  isVlc,
}: UseTimeManagementProps) => {
  const [currentTime, setCurrentTime] = useState(0);
  const [remainingTime, setRemainingTime] = useState(Number.POSITIVE_INFINITY);

  const updateTimes = useCallback(
    (currentProgress: number, maxValue: number) => {
      const current = isVlc ? currentProgress : ticksToSeconds(currentProgress);
      const remaining = isVlc
        ? maxValue - currentProgress
        : ticksToSeconds(maxValue - currentProgress);

      setCurrentTime(current);
      setRemainingTime(remaining);
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

  const getEndTime = () => {
    const now = new Date();
    const remainingMs = isVlc ? remainingTime : remainingTime * 1000;
    const finishTime = new Date(now.getTime() + remainingMs);
    return finishTime.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  return {
    currentTime,
    remainingTime,
    updateTimes,
    getEndTime,
  };
};
