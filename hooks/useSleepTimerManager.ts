import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert } from "react-native";
import type {
  SleepTimerRequest,
  SleepTimerStatusResponse,
} from "@/augmentations/api";
import { useJellysleep } from "@/hooks/useJellysleep";
import {
  type SleepTimerOption,
  SleepTimerType,
  useSettings,
} from "@/utils/atoms/settings";
import { formatDuration } from "@/utils/formatDuration";

interface UseSleepTimerManagerOptions {
  onPlaybackStart?: boolean;
}

export const useSleepTimerManager = (
  options: UseSleepTimerManagerOptions = {},
) => {
  const { onPlaybackStart } = options;
  const { t } = useTranslation();
  const { settings } = useSettings();
  const { startSleepTimer, cancelSleepTimer, getSleepTimerStatus, isLoading } =
    useJellysleep();

  const [timerStatus, setTimerStatus] =
    useState<SleepTimerStatusResponse | null>(null);

  // Check timer status when component mounts or settings change
  useEffect(() => {
    if (!settings?.jellysleepEnabled) return;

    const checkStatus = async () => {
      const status = await getSleepTimerStatus();
      setTimerStatus(status);
    };

    // Check immediately
    checkStatus();
  }, [settings?.jellysleepEnabled, getSleepTimerStatus]);

  // Check timer status when playback starts (optional)
  useEffect(() => {
    if (!settings?.jellysleepEnabled || !onPlaybackStart) return;

    const checkStatusOnPlayback = async () => {
      const status = await getSleepTimerStatus();
      setTimerStatus(status);
    };

    checkStatusOnPlayback();
  }, [onPlaybackStart, settings?.jellysleepEnabled, getSleepTimerStatus]);

  // Helper function to start a timer and handle the response
  const executeTimerStart = useCallback(
    (request: SleepTimerRequest) => {
      startSleepTimer(request)
        .then((response) => {
          if (response?.success) {
            // Refresh status
            getSleepTimerStatus()
              .then(setTimerStatus)
              .catch((error) => {
                console.error("Failed to refresh timer status:", error);
              });
          } else {
            Alert.alert(
              t("jellysleep.error_title"),
              response?.error || t("jellysleep.error_generic"),
            );
          }
        })
        .catch((error) => {
          console.error("Failed to start sleep timer:", error);
          Alert.alert(
            t("jellysleep.error_title"),
            t("jellysleep.error_generic"),
          );
        });
    },
    [startSleepTimer, getSleepTimerStatus, t],
  );

  const handleStartTimer = useCallback(
    (minutes: number) => {
      const request: SleepTimerRequest = {
        type: SleepTimerType.DURATION,
        duration: minutes,
        label: `${formatDuration(minutes, t)} ${t("jellysleep.sleep_timer_label")}`,
      };

      executeTimerStart(request);
    },
    [executeTimerStart, t],
  );

  const handleStartEpisodeTimer = useCallback(
    (episodeCount: number) => {
      const request: SleepTimerRequest = {
        type: SleepTimerType.EPISODE,
        episodeCount,
        label: t("jellysleep.after_episode", { count: episodeCount }),
      };

      executeTimerStart(request);
    },
    [executeTimerStart, t],
  );

  const handleCancelTimer = useCallback(() => {
    cancelSleepTimer()
      .then((success) => {
        if (success) {
          setTimerStatus(null);
        }
      })
      .catch((error) => {
        console.error("Failed to cancel sleep timer:", error);
      });
  }, [cancelSleepTimer]);

  const handleStartTimerFromOption = useCallback(
    (option: SleepTimerOption) => {
      if (option.type === SleepTimerType.DURATION && option.duration) {
        handleStartTimer(option.duration);
      } else if (
        option.type === SleepTimerType.EPISODE &&
        option.episodeCount
      ) {
        handleStartEpisodeTimer(option.episodeCount);
      }
    },
    [handleStartTimer, handleStartEpisodeTimer],
  );

  const isEnabled = settings?.jellysleepEnabled ?? false;
  const timerOptions = settings?.jellysleepTimerOptions ?? [];

  return {
    timerStatus,
    isLoading,
    isEnabled,
    timerOptions,
    handleStartTimer,
    handleStartTimerFromOption,
    handleCancelTimer,
  };
};
