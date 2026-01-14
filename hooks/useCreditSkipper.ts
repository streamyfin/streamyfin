import { Api } from "@jellyfin/sdk";
import { useCallback, useEffect, useState } from "react";
import { DownloadedItem } from "@/providers/Downloads/types";
import { useSegments } from "@/utils/segments";
import { msToSeconds, secondsToMs } from "@/utils/time";
import { useHaptic } from "./useHaptic";

/**
 * Custom hook to handle skipping credits in a media player.
 * The player reports time values in milliseconds.
 */
export const useCreditSkipper = (
  itemId: string,
  currentTime: number,
  seek: (ms: number) => void,
  play: () => void,
  isOffline = false,
  api: Api | null = null,
  downloadedFiles: DownloadedItem[] | undefined = undefined,
  totalDuration?: number,
) => {
  const [showSkipCreditButton, setShowSkipCreditButton] = useState(false);
  const lightHapticFeedback = useHaptic("light");

  // Convert ms to seconds for comparison with timestamps
  const currentTimeSeconds = msToSeconds(currentTime);

  const totalDurationInSeconds =
    totalDuration != null ? msToSeconds(totalDuration) : undefined;

  // Regular function (not useCallback) to match useIntroSkipper pattern
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

  // Determine if there's content after credits (credits don't extend to video end)
  // Use a 5-second buffer to account for timing discrepancies
  const hasContentAfterCredits = (() => {
    if (
      !creditTimestamps ||
      totalDurationInSeconds == null ||
      !Number.isFinite(totalDurationInSeconds)
    ) {
      return false;
    }
    const creditsEndToVideoEnd =
      totalDurationInSeconds - creditTimestamps.endTime;
    // If credits end more than 5 seconds before video ends, there's content after
    return creditsEndToVideoEnd > 5;
  })();

  useEffect(() => {
    if (creditTimestamps) {
      const shouldShow =
        currentTimeSeconds > creditTimestamps.startTime &&
        currentTimeSeconds < creditTimestamps.endTime;

      setShowSkipCreditButton(shouldShow);
    } else {
      // Reset button state when no credit timestamps exist
      if (showSkipCreditButton) {
        setShowSkipCreditButton(false);
      }
    }
  }, [creditTimestamps, currentTimeSeconds, showSkipCreditButton]);

  const skipCredit = useCallback(() => {
    if (!creditTimestamps) return;

    try {
      lightHapticFeedback();

      // Calculate the target seek position
      let seekTarget = creditTimestamps.endTime;

      // If we have total duration, ensure we don't seek past the end of the video.
      // Some media sources report credit end times that exceed the actual video duration,
      // which causes the player to pause/stop when seeking past the end.
      // Leave a small buffer (2 seconds) to trigger the natural end-of-video flow
      // (next episode countdown, etc.) instead of an abrupt pause.
      if (totalDurationInSeconds && seekTarget >= totalDurationInSeconds) {
        seekTarget = Math.max(0, totalDurationInSeconds - 2);
      }

      wrappedSeek(seekTarget);
      setTimeout(() => {
        play();
      }, 200);
    } catch (error) {
      console.error("[CREDIT_SKIPPER] Error skipping credit", error);
    }
  }, [
    creditTimestamps,
    lightHapticFeedback,
    wrappedSeek,
    play,
    totalDurationInSeconds,
  ]);

  return { showSkipCreditButton, skipCredit, hasContentAfterCredits };
};
