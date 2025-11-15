import { Api } from "@jellyfin/sdk";
import { useCallback, useEffect, useState } from "react";
import { DownloadedItem } from "@/providers/Downloads/types";
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
  api: Api | null = null,
  downloadedFiles: DownloadedItem[] | undefined = undefined,
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

  const { data: segments } = useSegments(
    itemId,
    isOffline,
    downloadedFiles,
    api,
  );
  const introTimestamps = segments?.introSegments?.[0];

  useEffect(() => {
    console.log(`[INTRO_SKIPPER] Hook state:`, {
      itemId,
      currentTime,
      hasSegments: !!segments,
      segments: segments,
      introSegmentsCount: segments?.introSegments?.length || 0,
      introSegments: segments?.introSegments,
      hasIntroTimestamps: !!introTimestamps,
      introTimestamps,
      isVlc,
      isOffline,
    });

    if (introTimestamps) {
      const shouldShow =
        currentTime > introTimestamps.startTime &&
        currentTime < introTimestamps.endTime;

      console.log(`[INTRO_SKIPPER] Button visibility check:`, {
        currentTime,
        introStart: introTimestamps.startTime,
        introEnd: introTimestamps.endTime,
        afterStart: currentTime > introTimestamps.startTime,
        beforeEnd: currentTime < introTimestamps.endTime,
        shouldShow,
      });

      setShowSkipButton(shouldShow);
    } else {
      if (showSkipButton) {
        console.log(`[INTRO_SKIPPER] No intro timestamps, hiding button`);
        setShowSkipButton(false);
      }
    }
  }, [introTimestamps, currentTime, showSkipButton]);

  const skipIntro = useCallback(() => {
    if (!introTimestamps) return;
    try {
      console.log(
        `[INTRO_SKIPPER] Skipping intro to:`,
        introTimestamps.endTime,
      );
      lightHapticFeedback();
      wrappedSeek(introTimestamps.endTime);
      setTimeout(() => {
        play();
      }, 200);
    } catch (error) {
      console.error("[INTRO_SKIPPER] Error skipping intro", error);
    }
  }, [introTimestamps, lightHapticFeedback, wrappedSeek, play]);

  console.log(`[INTRO_SKIPPER] Returning state:`, { showSkipButton });

  return { showSkipButton, skipIntro };
};
