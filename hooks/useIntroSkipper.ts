import { useCallback, useEffect, useState } from "react";
import { useSegments } from "@/utils/segments";
import { msToSeconds, secondsToMs } from "@/utils/time";
import { useHaptic } from "./useHaptic";

/**
 * Custom hook to handle skipping intros in a media player.
 *
 * @param {number} currentTime - The current playback time in seconds.
 */
export const useIntroSkipper = (
  itemId: string,
  currentTime: number,
  seek: (ticks: number) => void,
  play: () => void,
  isVlc = false,
  isOffline = false,
) => {
  const [showSkipButton, setShowSkipButton] = useState(false);
  if (isVlc) {
    currentTime = msToSeconds(currentTime);
  }
  const lightHapticFeedback = useHaptic("light");

  const wrappedSeek = (seconds: number) => {
    if (isVlc) {
      seek(secondsToMs(seconds));
      return;
    }
    seek(seconds);
  };

  const { data: segments } = useSegments(itemId, isOffline);
  const introTimestamps = segments?.introSegments?.[0];

  useEffect(() => {
    if (introTimestamps) {
      setShowSkipButton(
        currentTime > introTimestamps.startTime &&
          currentTime < introTimestamps.endTime,
      );
    }
  }, [introTimestamps, currentTime]);

  const skipIntro = useCallback(() => {
    if (!introTimestamps) return;
    try {
      lightHapticFeedback();
      wrappedSeek(introTimestamps.endTime);
      setTimeout(() => {
        play();
      }, 200);
    } catch (error) {
      console.error("Error skipping intro", error);
    }
  }, [introTimestamps, lightHapticFeedback, wrappedSeek, play]);

  return { showSkipButton, skipIntro };
};
