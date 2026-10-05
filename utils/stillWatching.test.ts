import { StillWatchingPresets } from "@/constants/StillWatching";
import {
  getStillWatchingThresholds,
  isStillWatchingDue,
  isStillWatchingDueAtEnd,
  markStillWatchingInput,
  recordStillWatchingAutoplay,
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

  test("reads a count the plugin sent as a string", () => {
    expect(stillWatchingPresetFromEpisodeCount("3")).toBe("default");
  });

  test("ignores values it cannot read", () => {
    expect(stillWatchingPresetFromEpisodeCount(undefined)).toBeUndefined();
    expect(stillWatchingPresetFromEpisodeCount(null)).toBeUndefined();
    expect(stillWatchingPresetFromEpisodeCount("three")).toBeUndefined();
    expect(stillWatchingPresetFromEpisodeCount({ key: "x" })).toBeUndefined();
  });
});

describe("the session", () => {
  const start = 1_000_000_000;
  const dueAtEnd = (
    overrides: Partial<Parameters<typeof isStillWatchingDueAtEnd>[0]> = {},
  ) =>
    isStillWatchingDueAtEnd({
      autoPlayNextEpisode: true,
      preset: "default",
      remainingMs: 0,
      tracksInput: true,
      nowMs: start + 100 * MINUTE,
      ...overrides,
    });

  beforeEach(() => resetStillWatchingSession(start));

  test("fires on idle time once the session is long enough", () => {
    expect(dueAtEnd()).toBe(true);
    expect(dueAtEnd({ nowMs: start + 80 * MINUTE })).toBe(false);
  });

  test("judges at the end of the episode, not now", () => {
    expect(
      dueAtEnd({ nowMs: start + 80 * MINUTE, remainingMs: 10 * MINUTE }),
    ).toBe(true);
  });

  test("an input pushes the idle branch back", () => {
    markStillWatchingInput(start + 50 * MINUTE);
    expect(dueAtEnd()).toBe(false);
  });

  test("counts autoplays, and a reset clears them", () => {
    markStillWatchingInput(start + 50 * MINUTE);
    recordStillWatchingAutoplay();
    recordStillWatchingAutoplay();
    expect(dueAtEnd()).toBe(false);
    recordStillWatchingAutoplay();
    expect(dueAtEnd()).toBe(true);

    resetStillWatchingSession(start + 50 * MINUTE);
    expect(dueAtEnd({ nowMs: start + 200 * MINUTE })).toBe(true); // idle
    expect(dueAtEnd({ nowMs: start + 200 * MINUTE, tracksInput: false })).toBe(
      false,
    );
  });

  // The native chrome has no idle time: only the count may trip it.
  test("without input tracking, only the count fires it", () => {
    expect(dueAtEnd({ tracksInput: false })).toBe(false);
    for (let i = 0; i < 3; i++) recordStillWatchingAutoplay();
    expect(dueAtEnd({ tracksInput: false })).toBe(true);
  });

  test("never fires without autoplay or with the preset off", () => {
    expect(dueAtEnd({ autoPlayNextEpisode: false })).toBe(false);
    expect(dueAtEnd({ preset: "disabled" })).toBe(false);
  });
});
