import { apiAtom } from "@/providers/JellyfinProvider";
import { getAuthHeaders } from "@/utils/jellyfin/jellyfin";
import { writeToLog } from "@/utils/log";
import { msToSeconds, secondsToMs } from "@/utils/time";
import { useQuery } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { useCallback, useEffect, useState } from "react";
import { useHaptic } from "./useHaptic";

interface IntroTimestamps {
  EpisodeId: string;
  HideSkipPromptAt: number;
  IntroEnd: number;
  IntroStart: number;
  ShowSkipPromptAt: number;
  Valid: boolean;
}

/**
 * Custom hook to handle skipping intros in a media player.
 *
 * @param {number} currentTime - The current playback time in seconds.
 */
export const useIntroSkipper = (
  itemId: string | undefined,
  currentTime: number,
  seek: (ticks: number) => void,
  play: () => void,
  isVlc = false,
) => {
  const [api] = useAtom(apiAtom);
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

  const { data: introTimestamps } = useQuery<IntroTimestamps | null>({
    queryKey: ["introTimestamps", itemId],
    queryFn: async () => {
      if (!itemId) {
        return null;
      }

      const res = await api?.axiosInstance.get(
        `${api.basePath}/Episode/${itemId}/IntroTimestamps`,
        {
          headers: getAuthHeaders(api),
        },
      );

      if (res?.status !== 200) {
        return null;
      }

      return res?.data;
    },
    enabled: !!itemId,
    retry: false,
  });

  useEffect(() => {
    if (introTimestamps) {
      setShowSkipButton(
        currentTime > introTimestamps.ShowSkipPromptAt &&
          currentTime < introTimestamps.HideSkipPromptAt,
      );
    }
  }, [introTimestamps, currentTime]);

  const skipIntro = useCallback(() => {
    if (!introTimestamps) return;
    try {
      lightHapticFeedback();
      wrappedSeek(introTimestamps.IntroEnd);
      setTimeout(() => {
        play();
      }, 200);
    } catch (error) {
      writeToLog("ERROR", "Error skipping intro", error);
    }
  }, [introTimestamps]);

  return { showSkipButton, skipIntro };
};
