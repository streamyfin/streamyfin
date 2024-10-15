import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { apiAtom } from "@/providers/JellyfinProvider";
import { getAuthHeaders } from "@/utils/jellyfin/jellyfin";
import { writeToLog } from "@/utils/log";

interface IntroTimestamps {
  EpisodeId: string;
  HideSkipPromptAt: number;
  IntroEnd: number;
  IntroStart: number;
  ShowSkipPromptAt: number;
  Valid: boolean;
}

export const useIntroSkipper = (
  itemId: string | undefined,
  currentTime: number,
  videoRef: React.RefObject<any>
) => {
  const [api] = useAtom(apiAtom);
  const [showSkipButton, setShowSkipButton] = useState(false);

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
        }
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
          currentTime < introTimestamps.HideSkipPromptAt
      );
    }
  }, [introTimestamps, currentTime]);

  const skipIntro = useCallback(() => {
    console.log("skipIntro");
    if (!introTimestamps || !videoRef.current) return;
    try {
      videoRef.current.seek(introTimestamps.IntroEnd);
      setTimeout(() => {
        videoRef.current?.resume();
      }, 200);
    } catch (error) {
      writeToLog("ERROR", "Error skipping intro", error);
    }
  }, [introTimestamps, videoRef]);

  return { showSkipButton, skipIntro };
};
