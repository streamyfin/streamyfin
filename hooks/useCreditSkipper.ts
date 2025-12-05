import { Api } from "@jellyfin/sdk";
import { useCallback, useEffect, useState } from "react";
import { DownloadedItem } from "@/providers/Downloads/types";
import { useSegments } from "@/utils/segments";
import { msToSeconds, secondsToMs } from "@/utils/time";
import { useHaptic } from "./useHaptic";

/**
 * Custom hook to handle skipping credits in a media player.
 * MPV player uses milliseconds for time.
 */
export const useCreditSkipper = (
  itemId: string,
  currentTime: number,
  seek: (ms: number) => void,
  play: () => void,
  isOffline = false,
  api: Api | null = null,
  downloadedFiles: DownloadedItem[] | undefined = undefined,
) => {
  const [showSkipCreditButton, setShowSkipCreditButton] = useState(false);
  const lightHapticFeedback = useHaptic("light");

  // Convert ms to seconds for comparison with timestamps
  const currentTimeSeconds = msToSeconds(currentTime);

  const wrappedSeek = (seconds: number) => {
    seek(secondsToMs(seconds));
  };

  const { data: segments } = useSegments(
    itemId,
    isOffline,
    downloadedFiles,
    api,
  );
  const creditTimestamps = segments?.creditSegments?.[0];

  useEffect(() => {
    if (creditTimestamps) {
      setShowSkipCreditButton(
        currentTimeSeconds > creditTimestamps.startTime &&
          currentTimeSeconds < creditTimestamps.endTime,
      );
    }
  }, [creditTimestamps, currentTimeSeconds]);

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
