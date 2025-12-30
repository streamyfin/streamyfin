import { useCallback, useRef } from "react";
import type { SharedValue } from "react-native-reanimated";
import { useHaptic } from "@/hooks/useHaptic";
import { useSettings } from "@/utils/atoms/settings";
import { writeToLog } from "@/utils/log";
import { secondsToMs } from "@/utils/time";

interface UseVideoNavigationProps {
  progress: SharedValue<number>;
  isPlaying: boolean;
  chapterStartMs?: number[];
  seek: (value: number) => void;
  play: () => void;
}

/**
 * Hook to manage video navigation (seeking forward/backward).
 * MPV player uses milliseconds for time values.
 */
export function useVideoNavigation({
  progress,
  isPlaying,
  chapterStartMs = [],
  seek,
  play,
}: UseVideoNavigationProps) {
  const { settings } = useSettings();
  const lightHapticFeedback = useHaptic("light");
  const wasPlayingRef = useRef(false);

  const handleSeekBackward = useCallback(
    async (seconds: number) => {
      wasPlayingRef.current = isPlaying;
      try {
        const curr = progress.value;
        if (curr !== undefined) {
          // MPV uses ms
          const newTime = Math.max(0, curr - secondsToMs(seconds));
          seek(newTime);
        }
      } catch (error) {
        writeToLog("ERROR", "Error seeking video backwards", error);
      }
    },
    [isPlaying, seek, progress],
  );

  const handleSeekForward = useCallback(
    async (seconds: number) => {
      wasPlayingRef.current = isPlaying;
      try {
        const curr = progress.value;
        if (curr !== undefined) {
          // MPV uses ms
          const newTime = curr + secondsToMs(seconds);
          seek(Math.max(0, newTime));
        }
      } catch (error) {
        writeToLog("ERROR", "Error seeking video forwards", error);
      }
    },
    [isPlaying, seek, progress],
  );

  const handleSkipBackward = useCallback(async () => {
    if (!settings?.rewindSkipTime) {
      return;
    }
    wasPlayingRef.current = isPlaying;
    lightHapticFeedback();
    try {
      const curr = progress.value;
      if (curr !== undefined) {
        // MPV uses ms
        const newTime = Math.max(
          0,
          curr - secondsToMs(settings.rewindSkipTime),
        );
        seek(newTime);
        if (wasPlayingRef.current) {
          play();
        }
      }
    } catch (error) {
      writeToLog("ERROR", "Error seeking video backwards", error);
    }
  }, [settings, isPlaying, play, seek, progress, lightHapticFeedback]);

  const handleSkipForward = useCallback(async () => {
    if (!settings?.forwardSkipTime) {
      return;
    }
    wasPlayingRef.current = isPlaying;
    lightHapticFeedback();
    try {
      const curr = progress.value;
      if (curr !== undefined) {
        // MPV uses ms
        const newTime = curr + secondsToMs(settings.forwardSkipTime);
        seek(Math.max(0, newTime));
        if (wasPlayingRef.current) {
          play();
        }
      }
    } catch (error) {
      writeToLog("ERROR", "Error seeking video forwards", error);
    }
  }, [settings, isPlaying, play, seek, progress, lightHapticFeedback]);

  const handlePreviousChapter = useCallback(async () => {
    wasPlayingRef.current = isPlaying;
    lightHapticFeedback();

    try {
      const playProgress = progress.value;
      if (playProgress !== undefined) {
        const pastProgress = Math.max(playProgress - secondsToMs(10), 0);
        const currentChapterIdx = getCurrentChapterIdx({
          chapterStartMs,
          currentMs: pastProgress,
        });
        const newPositionMs = chapterStartMs[currentChapterIdx];
        seek(Math.max(0, newPositionMs));
        if (wasPlayingRef.current) {
          play();
        }
      }
    } catch (error) {
      writeToLog("ERROR", "Error skipping to previous chapter", error);
    }
  }, [isPlaying, play, seek, progress, lightHapticFeedback]);

  const handleNextChapter = useCallback(async () => {
    wasPlayingRef.current = isPlaying;
    lightHapticFeedback();

    try {
      const playProgress = progress.value;
      if (playProgress !== undefined) {
        const currentChapterIdx = getCurrentChapterIdx({
          chapterStartMs,
          currentMs: playProgress,
        });
        const nextChapterIndex = currentChapterIdx + 1;

        if (nextChapterIndex > chapterStartMs.length - 1) return;

        const newPositionMs = chapterStartMs[nextChapterIndex];
        seek(Math.max(0, newPositionMs));
        if (wasPlayingRef.current) {
          play();
        }
      }
    } catch (error) {
      writeToLog("ERROR", "Error skipping to next chapter", error);
    }
  }, [isPlaying, play, seek, progress, lightHapticFeedback]);

  return {
    handleSeekBackward,
    handleSeekForward,
    handleSkipBackward,
    handleSkipForward,
    handlePreviousChapter,
    handleNextChapter,
    wasPlayingRef,
  };
}

interface GetCurrentChapterIdxParams {
  chapterStartMs: number[];
  currentMs: number;
}
const getCurrentChapterIdx = ({
  chapterStartMs,
  currentMs,
}: GetCurrentChapterIdxParams) =>
  chapterStartMs.findLastIndex((c) => currentMs >= c);
