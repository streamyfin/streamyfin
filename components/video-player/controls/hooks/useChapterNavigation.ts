import type { ChapterInfo } from "@jellyfin/sdk/lib/generated-client";
import { useCallback, useMemo } from "react";
import type { SharedValue } from "react-native-reanimated";
import { ticksToMs } from "@/utils/time";

export interface UseChapterNavigationProps {
  /** Chapters array from the item */
  chapters: ChapterInfo[] | null | undefined;
  /** Current progress in milliseconds (SharedValue) */
  progress: SharedValue<number>;
  /** Total duration in milliseconds */
  maxMs: number;
  /** Seek function that accepts milliseconds */
  seek: (ms: number) => void;
}

export interface UseChapterNavigationReturn {
  /** Array of chapters */
  chapters: ChapterInfo[];
  /** Index of the current chapter (-1 if no chapters) */
  currentChapterIndex: number;
  /** Current chapter info or null */
  currentChapter: ChapterInfo | null;
  /** Whether there's a next chapter available */
  hasNextChapter: boolean;
  /** Whether there's a previous chapter available */
  hasPreviousChapter: boolean;
  /** Navigate to the next chapter */
  goToNextChapter: () => void;
  /** Navigate to the previous chapter (or restart current if >3s in) */
  goToPreviousChapter: () => void;
  /** Array of chapter positions as percentages (0-100) for tick marks */
  chapterPositions: number[];
  /** Whether chapters are available */
  hasChapters: boolean;
}

// Threshold in ms - if more than 3 seconds into chapter, restart instead of going to previous
const RESTART_THRESHOLD_MS = 3000;

/**
 * Hook for chapter navigation in video player
 * Provides current chapter info and navigation functions
 */
export function useChapterNavigation({
  chapters: rawChapters,
  progress,
  maxMs,
  seek,
}: UseChapterNavigationProps): UseChapterNavigationReturn {
  // Ensure chapters is always an array
  const chapters = useMemo(() => rawChapters ?? [], [rawChapters]);

  // Calculate chapter positions as percentages for tick marks
  const chapterPositions = useMemo(() => {
    if (!chapters.length || maxMs <= 0) return [];

    return chapters
      .map((chapter) => {
        const positionMs = ticksToMs(chapter.StartPositionTicks);
        return (positionMs / maxMs) * 100;
      })
      .filter((pos) => pos > 0 && pos < 100); // Skip first (0%) and any at the end
  }, [chapters, maxMs]);

  // Find current chapter index based on progress
  // The current chapter is the one with the largest StartPositionTicks that is <= current progress
  const getCurrentChapterIndex = useCallback((): number => {
    if (!chapters.length) return -1;

    const currentMs = progress.value;
    let currentIndex = -1;

    for (let i = 0; i < chapters.length; i++) {
      const chapterMs = ticksToMs(chapters[i].StartPositionTicks);
      if (chapterMs <= currentMs) {
        currentIndex = i;
      } else {
        break;
      }
    }

    return currentIndex;
  }, [chapters, progress]);

  // Current chapter index (computed once for rendering)
  const currentChapterIndex = getCurrentChapterIndex();

  // Current chapter info
  const currentChapter = useMemo(() => {
    if (currentChapterIndex < 0 || currentChapterIndex >= chapters.length) {
      return null;
    }
    return chapters[currentChapterIndex];
  }, [chapters, currentChapterIndex]);

  // Navigation availability
  const hasNextChapter =
    chapters.length > 0 && currentChapterIndex < chapters.length - 1;
  const hasPreviousChapter = chapters.length > 0 && currentChapterIndex >= 0;

  // Navigate to next chapter
  const goToNextChapter = useCallback(() => {
    const idx = getCurrentChapterIndex();
    if (idx < chapters.length - 1) {
      const nextChapter = chapters[idx + 1];
      const nextMs = ticksToMs(nextChapter.StartPositionTicks);
      progress.value = nextMs;
      seek(nextMs);
    }
  }, [chapters, getCurrentChapterIndex, progress, seek]);

  // Navigate to previous chapter (or restart current if >3s in)
  const goToPreviousChapter = useCallback(() => {
    const idx = getCurrentChapterIndex();
    if (idx < 0) return;

    const currentChapterMs = ticksToMs(chapters[idx].StartPositionTicks);
    const currentMs = progress.value;
    const timeIntoChapter = currentMs - currentChapterMs;

    // If more than 3 seconds into the current chapter, restart it
    // Otherwise, go to the previous chapter
    if (timeIntoChapter > RESTART_THRESHOLD_MS && idx >= 0) {
      progress.value = currentChapterMs;
      seek(currentChapterMs);
    } else if (idx > 0) {
      const prevChapter = chapters[idx - 1];
      const prevMs = ticksToMs(prevChapter.StartPositionTicks);
      progress.value = prevMs;
      seek(prevMs);
    } else {
      // At the first chapter, just restart it
      progress.value = currentChapterMs;
      seek(currentChapterMs);
    }
  }, [chapters, getCurrentChapterIndex, progress, seek]);

  return {
    chapters,
    currentChapterIndex,
    currentChapter,
    hasNextChapter,
    hasPreviousChapter,
    goToNextChapter,
    goToPreviousChapter,
    chapterPositions,
    hasChapters: chapters.length > 0,
  };
}
