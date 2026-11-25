import {
  AUDIOBOOK_SLEEP_FADE_MS,
  AUDIOBOOK_SLEEP_MAX_TICK_MS,
} from "@/constants/Audiobooks";
import {
  autoRewindSeconds,
  fadeVolume,
  SLEEP_TIMER_OFF,
  sleepTimerForMinutes,
  tickChapterTimer,
  tickDurationTimer,
} from "./sleepTimer";

describe("a sleep timer for a number of minutes", () => {
  test("counts down by the time played", () => {
    const tick = tickDurationTimer(sleepTimerForMinutes(10), 1000);
    expect(tick.timer).toMatchObject({
      mode: "duration",
      remainingMs: 599_000,
    });
    expect(tick.volume).toBe(1);
    expect(tick.expired).toBe(false);
  });

  // The app was suspended or the player stalled: minutes nobody heard must
  // not come off the timer.
  test("a late tick counts for no more than the cap", () => {
    const tick = tickDurationTimer(sleepTimerForMinutes(10), 120_000);
    expect(tick.timer).toMatchObject({
      remainingMs: 600_000 - AUDIOBOOK_SLEEP_MAX_TICK_MS,
    });
  });

  test("fades over the last stretch", () => {
    const tick = tickDurationTimer(
      {
        mode: "duration",
        remainingMs: AUDIOBOOK_SLEEP_FADE_MS,
        totalMs: 60_000,
      },
      AUDIOBOOK_SLEEP_FADE_MS / 2,
    );
    expect(tick.volume).toBeCloseTo(0.5, 5);
  });

  test("runs out, turns off and says to pause", () => {
    const tick = tickDurationTimer(
      { mode: "duration", remainingMs: 500, totalMs: 60_000 },
      1000,
    );
    expect(tick).toEqual({ timer: SLEEP_TIMER_OFF, volume: 1, expired: true });
  });

  test("leaves a timer that is not counting minutes alone", () => {
    expect(tickDurationTimer({ mode: "chapter" }, 1000).timer).toEqual({
      mode: "chapter",
    });
  });

  test("the fade never goes above full or below silent", () => {
    expect(fadeVolume(AUDIOBOOK_SLEEP_FADE_MS * 3)).toBe(1);
    expect(fadeVolume(-5)).toBe(0);
  });
});

describe("a sleep timer for the end of the chapter", () => {
  test("keeps playing well before the end", () => {
    expect(tickChapterTimer(100, 600, 1)).toEqual({
      volume: 1,
      expired: false,
    });
  });

  // Progress comes about once a second: stopping half a second early beats
  // stopping into the next chapter.
  test("stops half a second before the chapter ends", () => {
    expect(tickChapterTimer(599.6, 600, 1).expired).toBe(true);
  });

  test("fades by the time left to hear, which a faster speed shortens", () => {
    const atNormal = tickChapterTimer(594.5, 600, 1).volume;
    const atDouble = tickChapterTimer(594.5, 600, 2).volume;
    expect(atNormal).toBeCloseTo(0.5, 5);
    expect(atDouble).toBeCloseTo(0.25, 5);
  });
});

describe("rewinding on resume", () => {
  test("nothing after a short pause", () => {
    expect(autoRewindSeconds(30_000)).toBe(0);
  });

  test("more the longer the pause", () => {
    expect(autoRewindSeconds(2 * 60_000)).toBe(5);
    expect(autoRewindSeconds(20 * 60_000)).toBe(15);
    expect(autoRewindSeconds(3 * 60 * 60_000)).toBe(30);
  });
});
