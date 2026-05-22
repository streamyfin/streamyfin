/**
 * Pure helpers for Jellyfin chapter markers. Dependency-free so they are
 * unit-testable under `bun test`.
 */

import type { ChapterInfo } from "@jellyfin/sdk/lib/generated-client/models";

const TICKS_PER_MS = 10000;

export interface ChapterMarker {
  /** Chapter start, in milliseconds. */
  positionMs: number;
  /** Chapter start as a percentage (0-100) of the media duration. */
  percent: number;
}

/** Chapter start positions in milliseconds, ascending. */
export const chapterStartsMs = (
  chapters: ChapterInfo[] | null | undefined,
): number[] =>
  (chapters ?? [])
    .map((c) => (c.StartPositionTicks ?? 0) / TICKS_PER_MS)
    .sort((a, b) => a - b);

/** Chapter markers within [0, durationMs]; empty when duration is unknown. */
export const chapterMarkers = (
  chapters: ChapterInfo[] | null | undefined,
  durationMs: number,
): ChapterMarker[] => {
  if (durationMs <= 0) return [];
  return chapterStartsMs(chapters)
    .filter((ms) => ms >= 0 && ms <= durationMs)
    .map((ms) => ({ positionMs: ms, percent: (ms / durationMs) * 100 }));
};

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
