import { Api } from "@jellyfin/sdk";
import { useCallback, useEffect, useState } from "react";
import { DownloadedItem } from "@/providers/Downloads/types";
import { useSegments } from "@/utils/segments";
import { msToSeconds, secondsToMs } from "@/utils/time";
import { useHaptic } from "./useHaptic";

/**
 * Custom hook to handle skipping intros in a media player.
 * MPV player uses milliseconds for time.
 *
 * @param {number} currentTime - The current playback time in milliseconds.
 */
export const useIntroSkipper = (
  itemId: string,
  currentTime: number,
  seek: (ms: number) => void,
  play: () => void,
  isOffline = false,
  api: Api | null = null,
  downloadedFiles: DownloadedItem[] | undefined = undefined,
) => {
  const [showSkipButton, setShowSkipButton] = useState(false);
  // Convert ms to seconds for comparison with timestamps
  const currentTimeSeconds = msToSeconds(currentTime);
  const lightHapticFeedback = useHaptic("light");

  const wrappedSeek = (seconds: number) => {
    seek(secondsToMs(seconds));
  };

  const { data: segments } = useSegments(
    itemId,
    isOffline,
    downloadedFiles,
    api,
  );
  const introTimestamps = segments?.introSegments?.[0];

  useEffect(() => {
    if (introTimestamps) {
      const shouldShow =
        currentTimeSeconds > introTimestamps.startTime &&
        currentTimeSeconds < introTimestamps.endTime;

      setShowSkipButton(shouldShow);
    } else {
      if (showSkipButton) {
        setShowSkipButton(false);
      }
    }
  }, [introTimestamps, currentTimeSeconds, showSkipButton]);

  const skipIntro = useCallback(() => {
    if (!introTimestamps) return;
    try {
      lightHapticFeedback();
      wrappedSeek(introTimestamps.endTime);
      setTimeout(() => {
        play();
      }, 200);
    } catch (error) {
      console.error("[INTRO_SKIPPER] Error skipping intro", error);
    }
  }, [introTimestamps, lightHapticFeedback, wrappedSeek, play]);

  return { showSkipButton, skipIntro };
};
