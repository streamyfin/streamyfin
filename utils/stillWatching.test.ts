import { StillWatchingPresets } from "@/constants/StillWatching";
import {
  coerceStillWatchingPreset,
  decideStillWatchingOnce,
  getStillWatchingThresholds,
  isStillWatchingDue,
  isStillWatchingDueAtEnd,
  recordStillWatchingAutoplay,
  resetStillWatchingSession,
  revertStillWatchingAutoplay,
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
      }),
    ).toBe(false);
  });

  test("waits for the session duration, whatever the count", () => {
    expect(
      isStillWatchingDue({
        thresholds: preset,
        playedCount: 10,
        sessionDurationMs: 89 * MINUTE,
      }),
    ).toBe(false);
  });

  test("fires on the episode count once the session is long enough", () => {
    expect(
      isStillWatchingDue({
        thresholds: preset,
        playedCount: 3,
        sessionDurationMs: 90 * MINUTE,
      }),
    ).toBe(true);
  });

  // There is no idle time to go by: only the count may trip it.
  test("a long session below the count keeps watching", () => {
    expect(
      isStillWatchingDue({
        thresholds: preset,
        playedCount: 2,
        sessionDurationMs: 500 * MINUTE,
      }),
    ).toBe(false);
  });

  test("a missing duration fails the session gate", () => {
    expect(
      isStillWatchingDue({
        thresholds: preset,
        playedCount: 10,
        sessionDurationMs: Number.NaN,
      }),
    ).toBe(false);
  });
});

describe("getStillWatchingThresholds", () => {
  test("maps each preset to jellyfin-web 12's numbers", () => {
    expect(getStillWatchingThresholds("disabled")).toBeNull();
    expect(getStillWatchingThresholds(undefined)).toBeNull();
    // Acts as it is labelled: a preset from a newer build as the nearest.
    expect(getStillWatchingThresholds("medium" as never)).toEqual(
      StillWatchingPresets.default,
    );
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
      preset: "default",
      remainingMs: 0,
      nowMs: start + 100 * MINUTE,
      ...overrides,
    });
  const autoplay = (times: number) => {
    for (let i = 0; i < times; i++) recordStillWatchingAutoplay();
  };

  beforeEach(() => resetStillWatchingSession(start));

  test("fires on the episode count once the session is long enough", () => {
    autoplay(3);
    expect(dueAtEnd()).toBe(true);
    expect(dueAtEnd({ nowMs: start + 80 * MINUTE })).toBe(false);
  });

  test("judges at the end of the episode, not now", () => {
    autoplay(3);
    expect(
      dueAtEnd({ nowMs: start + 80 * MINUTE, remainingMs: 10 * MINUTE }),
    ).toBe(true);
  });

  test("counts autoplays, and a reset clears them", () => {
    autoplay(2);
    expect(dueAtEnd()).toBe(false);
    autoplay(1);
    expect(dueAtEnd()).toBe(true);

    resetStillWatchingSession(start + 50 * MINUTE);
    expect(dueAtEnd({ nowMs: start + 200 * MINUTE })).toBe(false);
  });

  // The countdown ran out and the next episode failed to load: the viewer
  // never left this one, so it must not bring the prompt an episode early.
  test("an autoplay that did not happen is taken back", () => {
    autoplay(3);
    expect(dueAtEnd()).toBe(true);

    revertStillWatchingAutoplay();
    expect(dueAtEnd()).toBe(false);

    // Never below zero: three more are still what it takes.
    resetStillWatchingSession(start);
    revertStillWatchingAutoplay();
    autoplay(2);
    expect(dueAtEnd()).toBe(false);
    autoplay(1);
    expect(dueAtEnd()).toBe(true);
  });

  test("a decision taken with the autoplay counted goes with it", () => {
    recordStillWatchingAutoplay();
    expect(decideStillWatchingOnce("ep-1", () => true)).toBe(true);

    revertStillWatchingAutoplay();

    expect(decideStillWatchingOnce("ep-1", () => false)).toBe(false);
  });

  // At 2x the episode ends in half the media time left.
  test("turns media time into wall-clock time at the playback rate", () => {
    autoplay(3);
    const at80 = { nowMs: start + 80 * MINUTE, remainingMs: 20 * MINUTE };
    expect(dueAtEnd({ ...at80, playbackRate: 2 })).toBe(true);
    expect(
      dueAtEnd({ nowMs: start + 70 * MINUTE, remainingMs: 30 * MINUTE }),
    ).toBe(true);
    expect(
      dueAtEnd({
        nowMs: start + 70 * MINUTE,
        remainingMs: 30 * MINUTE,
        playbackRate: 2,
      }),
    ).toBe(false);
  });

  test("never fires with the preset off", () => {
    autoplay(3);
    expect(dueAtEnd({ preset: "disabled" })).toBe(false);
  });

  // A stream swap of the same episode must not re-decide under a countdown.
  test("decides once per episode until a reset or an autoplay", () => {
    const decide = jest.fn(() => true);
    expect(decideStillWatchingOnce("ep-1", decide)).toBe(true);
    expect(decideStillWatchingOnce("ep-1", () => false)).toBe(true);
    expect(decide).toHaveBeenCalledTimes(1);

    expect(decideStillWatchingOnce("ep-2", () => false)).toBe(false);

    recordStillWatchingAutoplay();
    expect(decideStillWatchingOnce("ep-2", () => true)).toBe(true);

    resetStillWatchingSession(start);
    expect(decideStillWatchingOnce("ep-2", () => false)).toBe(false);
    expect(decideStillWatchingOnce("ep-2", () => true)).toBe(false);
  });
});

describe("coerceStillWatchingPreset", () => {
  test.each([
    ["long", "long"],
    ["disabled", "disabled"],
    [3, "default"],
    [-1, "disabled"],
    [false, "disabled"],
    ["Disabled", "disabled"],
    ["VeryLong", "veryLong"],
    ["off", "disabled"],
    ["false", "disabled"],
    // A preset from a newer build.
    ["medium", "default"],
    [null, undefined],
    ["", undefined],
  ])("reads %p as %p", (value, expected) => {
    expect(coerceStillWatchingPreset(value)).toBe(expected);
  });
});
