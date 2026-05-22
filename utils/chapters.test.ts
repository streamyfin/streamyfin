import { describe, expect, test } from "bun:test";
import {
  chapterMarkers,
  currentChapterIndex,
  formatChapterTime,
} from "./chapters";

// Helper: a ChapterInfo with a start in milliseconds.
const ch = (ms: number, name?: string) => ({
  StartPositionTicks: ms * 10000,
  Name: name,
});

describe("chapterMarkers", () => {
  test("maps chapters to position + percent", () => {
    expect(chapterMarkers([ch(0), ch(30_000), ch(60_000)], 120_000)).toEqual([
      { positionMs: 0, percent: 0 },
      { positionMs: 30_000, percent: 25 },
      { positionMs: 60_000, percent: 50 },
    ]);
  });

  test("drops chapters past the duration", () => {
    expect(chapterMarkers([ch(0), ch(200_000)], 120_000)).toEqual([
      { positionMs: 0, percent: 0 },
    ]);
  });

  test("returns [] when duration is 0 or chapters missing", () => {
    expect(chapterMarkers([ch(0)], 0)).toEqual([]);
    expect(chapterMarkers(null, 120_000)).toEqual([]);
    expect(chapterMarkers(undefined, 120_000)).toEqual([]);
  });
});

describe("currentChapterIndex", () => {
  const chapters = [ch(0), ch(30_000), ch(60_000)];
  test("returns the chapter containing the position", () => {
    expect(currentChapterIndex(0, chapters)).toBe(0);
    expect(currentChapterIndex(15_000, chapters)).toBe(0);
    expect(currentChapterIndex(30_000, chapters)).toBe(1);
    expect(currentChapterIndex(90_000, chapters)).toBe(2);
  });
  test("returns -1 before the first chapter and for no chapters", () => {
    expect(currentChapterIndex(-5, chapters)).toBe(-1);
    expect(currentChapterIndex(10_000, [])).toBe(-1);
    expect(currentChapterIndex(10_000, null)).toBe(-1);
  });
});

describe("formatChapterTime", () => {
  test("formats m:ss and h:mm:ss", () => {
    expect(formatChapterTime(65_000)).toBe("1:05");
    expect(formatChapterTime(3_725_000)).toBe("1:02:05");
    expect(formatChapterTime(-100)).toBe("0:00");
  });
});
