import { useCallback, useEffect, useState } from "react";
import { useSegments } from "@/utils/segments";
import { msToSeconds, secondsToMs } from "@/utils/time";
import { useHaptic } from "./useHaptic";

export const useCreditSkipper = (
  itemId: string,
  currentTime: number,
  seek: (time: number) => void,
  play: () => void,
  isVlc = false,
  isOffline = false,
) => {
  const [showSkipCreditButton, setShowSkipCreditButton] = useState(false);
  const lightHapticFeedback = useHaptic("light");

  if (isVlc) {
    currentTime = msToSeconds(currentTime);
  }

  const wrappedSeek = (seconds: number) => {
    if (isVlc) {
      seek(secondsToMs(seconds));
      return;
    }
    seek(seconds);
  };

  const { data: segments } = useSegments(itemId, isOffline);
  const creditTimestamps = segments?.creditSegments?.[0];

  useEffect(() => {
    if (creditTimestamps) {
      setShowSkipCreditButton(
        currentTime > creditTimestamps.startTime &&
          currentTime < creditTimestamps.endTime,
      );
    }
  }, [creditTimestamps, currentTime]);

  const skipCredit = useCallback(() => {
    if (!creditTimestamps) return;
    try {
      lightHapticFeedback();
      wrappedSeek(creditTimestamps.endTime);
      setTimeout(() => {
        play();
      }, 200);
    } catch (error) {
      console.error("Error skipping credit", error);
    }
  }, [creditTimestamps, lightHapticFeedback, wrappedSeek, play]);

  return { showSkipCreditButton, skipCredit };
};
