import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { apiAtom } from "@/providers/JellyfinProvider";
import { getAuthHeaders } from "@/utils/jellyfin/jellyfin";
import { writeToLog } from "@/utils/log";

interface CreditTimestamps {
  Introduction: {
    Start: number;
    End: number;
    Valid: boolean;
  };
  Credits: {
    Start: number;
    End: number;
    Valid: boolean;
  };
}

export const useCreditSkipper = (
  itemId: string | undefined,
  currentTime: number,
  seek: (time: number) => void,
  play: () => void
) => {
  const [api] = useAtom(apiAtom);
  const [showSkipCreditButton, setShowSkipCreditButton] = useState(false);

  const { data: creditTimestamps } = useQuery<CreditTimestamps | null>({
    queryKey: ["creditTimestamps", itemId],
    queryFn: async () => {
      if (!itemId) {
        return null;
      }

      const res = await api?.axiosInstance.get(
        `${api.basePath}/Episode/${itemId}/Timestamps`,
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
    if (creditTimestamps) {
      setShowSkipCreditButton(
        currentTime > creditTimestamps.Credits.Start &&
          currentTime < creditTimestamps.Credits.End
      );
    }
  }, [creditTimestamps, currentTime]);

  const skipCredit = useCallback(() => {
    if (!creditTimestamps) return;
    try {
      seek(creditTimestamps.Credits.End);
      setTimeout(() => {
        play();
      }, 200);
    } catch (error) {
      writeToLog("ERROR", "Error skipping intro", error);
    }
  }, [creditTimestamps]);

  return { showSkipCreditButton, skipCredit };
};
