import { useAtomValue } from "jotai";
import { useCallback, useState } from "react";
import {
  type SleepTimerRequest,
  type SleepTimerResponse,
  type SleepTimerStatusResponse,
} from "@/augmentations/api";
import { apiAtom } from "@/providers/JellyfinProvider";

export const useJellysleep = () => {
  const api = useAtomValue(apiAtom);
  const [isLoading, setIsLoading] = useState(false);

  const startSleepTimer = useCallback(
    async (request: SleepTimerRequest): Promise<SleepTimerResponse | null> => {
      if (!api) {
        console.warn("Jellyfin API not available");
        return null;
      }

      setIsLoading(true);
      try {
        const response = await api.startSleepTimer(request);
        return response.data;
      } catch (error) {
        console.error("Failed to start sleep timer:", error);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [api],
  );

  const cancelSleepTimer = useCallback(async (): Promise<boolean> => {
    if (!api) {
      console.warn("Jellyfin API not available");
      return false;
    }

    setIsLoading(true);
    try {
      await api.cancelSleepTimer();
      return true;
    } catch (error) {
      console.error("Failed to cancel sleep timer:", error);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [api]);

  const getSleepTimerStatus =
    useCallback(async (): Promise<SleepTimerStatusResponse | null> => {
      if (!api) {
        console.warn("Jellyfin API not available");
        return null;
      }

      setIsLoading(true);
      try {
        const response = await api.getSleepTimerStatus();
        return response.data;
      } catch (error) {
        console.error("Failed to get sleep timer status:", error);
        return null;
      } finally {
        setIsLoading(false);
      }
    }, [api]);

  return {
    startSleepTimer,
    cancelSleepTimer,
    getSleepTimerStatus,
    isLoading,
  };
};
