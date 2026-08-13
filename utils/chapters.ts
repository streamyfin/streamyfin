/**
 * Pure helpers for Jellyfin chapter markers. Dependency-free so they are
 * unit-testable under `bun test`.
 */

import type { ChapterInfo } from "@jellyfin/sdk/lib/generated-client/models";
import { ticksToMs } from "@/utils/time";

export interface ChapterMarker {
  /** Chapter start, in milliseconds. */
  positionMs: number;
  /** Chapter start as a percentage (0-100) of the media duration. */
  percent: number;
}

export interface ChapterEntry {
  chapter: ChapterInfo;
  /** Chapter start, in milliseconds. */
  positionMs: number;
}

/** Chapters paired with their millisecond start, sorted ascending by start. */
export const sortedChapters = (
  chapters: ChapterInfo[] | null | undefined,
): ChapterEntry[] =>
  (chapters ?? [])
    .filter((c) => c.StartPositionTicks != null)
    .map((chapter) => ({
      chapter,
      positionMs: ticksToMs(chapter.StartPositionTicks),
    }))
    .sort((a, b) => a.positionMs - b.positionMs);

/** Chapter start positions in milliseconds, ascending. */
export const chapterStartsMs = (
  chapters: ChapterInfo[] | null | undefined,
): number[] =>
  (chapters ?? [])
    .filter((c) => c.StartPositionTicks != null)
    .map((c) => ticksToMs(c.StartPositionTicks))
    .sort((a, b) => a - b);

/** Chapter markers within [0, durationMs]; empty when duration is unknown. */
export const chapterMarkers = (
  chapters: ChapterInfo[] | null | undefined,
  durationMs: number,
): ChapterMarker[] => {
  if (durationMs <= 0) return [];
  return chapterStartsMs(chapters)
    .filter((ms) => ms >= 0 && ms < durationMs)
    .map((ms) => ({ positionMs: ms, percent: (ms / durationMs) * 100 }));
};

/**
 * Single gate for all chapter UI (ticks, list, bookmark icon, skip-overlay
 * shift): at least two real markers within the duration.
 */
export const hasChapterMarkers = (
  chapters: ChapterInfo[] | null | undefined,
  durationMs: number,
): boolean => chapterMarkers(chapters, durationMs).length > 1;

/** Index of the chapter containing `positionMs`, or -1 if before the first. */
export const currentChapterIndex = (
  positionMs: number,
  chapters: ChapterInfo[] | null | undefined,
): number => {
  const starts = chapterStartsMs(chapters);
  let index = -1;
  for (let i = 0; i < starts.length; i++) {
    if (positionMs >= starts[i]) index = i;
    else break;
  }
  return index;
};

/** Name of the chapter containing `positionMs`, or null if none / unnamed. */
export const chapterNameAt = (
  positionMs: number,
  chapters: ChapterInfo[] | null | undefined,
): string | null => {
  // Sort once, derive both the active index and the entry from the same array
  // — `chapterNameAt` runs on every playback tick, so paying for one `sort()`
  // instead of two is worth the duplication of the index loop here.
  const sorted = sortedChapters(chapters);
  let idx = -1;
  for (let i = 0; i < sorted.length; i++) {
    if (positionMs >= sorted[i].positionMs) idx = i;
    else break;
  }
  if (idx < 0) return null;
  const name = sorted[idx]?.chapter.Name;
  return name && name.length > 0 ? name : null;
};

/** `m:ss` (or `h:mm:ss` past an hour) label for a millisecond position. */
export const formatChapterTime = (positionMs: number): string => {
  const total = Math.max(0, Math.floor(positionMs / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${minutes}:${pad(seconds)}`;
};
