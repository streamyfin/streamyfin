import { useCallback, useRef } from "react";
import type { SharedValue } from "react-native-reanimated";
import { useHaptic } from "@/hooks/useHaptic";
import { useSettings } from "@/utils/atoms/settings";
import { writeToLog } from "@/utils/log";
import { secondsToMs, ticksToSeconds } from "@/utils/time";

interface UseSkipControlsProps {
  progress: SharedValue<number>;
  isPlaying: boolean;
  isVlc: boolean;
  seek: (ticks: number) => void;
  play: () => void;
}

export const useSkipControls = ({
  progress,
  isPlaying,
  isVlc,
  seek,
  play,
}: UseSkipControlsProps) => {
  const [settings] = useSettings();
  const lightHapticFeedback = useHaptic("light");
  const wasPlayingRef = useRef(false);

  const handleSkipBackward = useCallback(async () => {
    if (!settings?.rewindSkipTime) {
      return;
    }
    wasPlayingRef.current = isPlaying;
    lightHapticFeedback();
    try {
      const curr = progress.value;
      if (curr !== undefined) {
        const newTime = isVlc
          ? Math.max(0, curr - secondsToMs(settings.rewindSkipTime))
          : Math.max(0, ticksToSeconds(curr) - settings.rewindSkipTime);
        seek(newTime);
        if (wasPlayingRef.current) {
          play();
        }
      }
    } catch (error) {
      writeToLog("ERROR", "Error seeking video backwards", error);
    }
  }, [settings, isPlaying, isVlc, play, seek, lightHapticFeedback]);

  const handleSkipForward = useCallback(async () => {
    if (!settings?.forwardSkipTime) {
      return;
    }
    wasPlayingRef.current = isPlaying;
    lightHapticFeedback();
    try {
      const curr = progress.value;
      if (curr !== undefined) {
        const newTime = isVlc
          ? curr + secondsToMs(settings.forwardSkipTime)
          : ticksToSeconds(curr) + settings.forwardSkipTime;
        seek(Math.max(0, newTime));
        if (wasPlayingRef.current) {
          play();
        }
      }
    } catch (error) {
      writeToLog("ERROR", "Error seeking video forwards", error);
    }
  }, [settings, isPlaying, isVlc, play, seek, lightHapticFeedback]);

  return {
    handleSkipBackward,
    handleSkipForward,
  };
};
