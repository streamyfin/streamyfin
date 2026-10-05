import { StillWatchingPresets } from "@/constants/StillWatching";
import {
  getStillWatchingThresholds,
  isStillWatchingDue,
  isStillWatchingDueAt,
  markStillWatchingInput,
  resetStillWatchingSession,
  stillWatchingPresetFromEpisodeCount,
} from "./stillWatching";

const MINUTE = 60_000;
const preset = StillWatchingPresets.default; // 3 episodes, 90 minutes

describe("isStillWatchingDue", () => {
  test("never fires when disabled", () => {
    expect(
      isStillWatchingDue({
        thresholds: null,
        playedCount: 100,
        sessionDurationMs: 1000 * MINUTE,
        idleMs: 1000 * MINUTE,
      }),
    ).toBe(false);
  });

  test("waits for the session duration, whatever the count", () => {
    expect(
      isStillWatchingDue({
        thresholds: preset,
        playedCount: 10,
        sessionDurationMs: 89 * MINUTE,
        idleMs: 89 * MINUTE,
      }),
    ).toBe(false);
  });

  test("fires on the episode count once the session is long enough", () => {
    expect(
      isStillWatchingDue({
        thresholds: preset,
        playedCount: 3,
        sessionDurationMs: 90 * MINUTE,
        idleMs: 0,
      }),
    ).toBe(true);
  });

  test("fires on idle time before the episode count is reached", () => {
    expect(
      isStillWatchingDue({
        thresholds: preset,
        playedCount: 1,
        sessionDurationMs: 120 * MINUTE,
        idleMs: 90 * MINUTE,
      }),
    ).toBe(true);
  });

  test("an active viewer below the count keeps watching", () => {
    expect(
      isStillWatchingDue({
        thresholds: preset,
        playedCount: 2,
        sessionDurationMs: 120 * MINUTE,
        idleMs: 10 * MINUTE,
      }),
    ).toBe(false);
  });

  // The native chrome cannot report input: only the count may trip it.
  test("without idle time, only the count fires it", () => {
    const base = {
      thresholds: preset,
      sessionDurationMs: 500 * MINUTE,
      idleMs: undefined,
    };
    expect(isStillWatchingDue({ ...base, playedCount: 2 })).toBe(false);
    expect(isStillWatchingDue({ ...base, playedCount: 3 })).toBe(true);
  });
});

describe("getStillWatchingThresholds", () => {
  test("maps each preset to jellyfin-web 12's numbers", () => {
    expect(getStillWatchingThresholds("disabled")).toBeNull();
    expect(getStillWatchingThresholds(undefined)).toBeNull();
    expect(getStillWatchingThresholds("short")).toEqual({
      episodes: 2,
      minutes: 60,
    });
    expect(getStillWatchingThresholds("veryLong")).toEqual({
      episodes: 8,
      minutes: 240,
    });
  });
});

describe("stillWatchingPresetFromEpisodeCount", () => {
  test.each([
    [{ key: "Disabled", value: -1 }, "disabled"],
    [0, "disabled"],
    [{ key: "1", value: 1 }, "short"],
    [2, "short"],
    [{ key: "3", value: 3 }, "default"],
    [4, "long"],
    [5, "long"],
    [7, "veryLong"],
    [20, "veryLong"],
  ])("maps %p to %p", (legacy, expected) => {
    expect(stillWatchingPresetFromEpisodeCount(legacy)).toBe(expected);
  });

  test("ignores values it cannot read", () => {
    expect(stillWatchingPresetFromEpisodeCount(undefined)).toBeUndefined();
    expect(stillWatchingPresetFromEpisodeCount("3")).toBeUndefined();
    expect(stillWatchingPresetFromEpisodeCount({ key: "x" })).toBeUndefined();
  });
});

describe("the session", () => {
  const start = 1_000_000_000;

  test("measures duration and idle time from the last reset and input", () => {
    resetStillWatchingSession(start);
    const at = start + 100 * MINUTE;
    const due = (tracksInput: boolean, playedCount = 0) =>
      isStillWatchingDueAt({
        preset: "default",
        playedCount,
        atMs: at,
        tracksInput,
      });

    expect(due(true)).toBe(true);
    markStillWatchingInput(start + 50 * MINUTE);
    expect(due(true)).toBe(false);
    expect(due(false)).toBe(false);
    expect(due(false, 3)).toBe(true);

    resetStillWatchingSession(start + 60 * MINUTE);
    expect(due(true, 3)).toBe(false);
  });
});
