import {
  AUDIOBOOK_AUTO_REWIND_STEPS,
  AUDIOBOOK_SLEEP_FADE_MS,
  AUDIOBOOK_SLEEP_MAX_TICK_MS,
} from "@/constants/Audiobooks";

export type SleepTimer =
  | { mode: "off" }
  /** Counts down time spent playing: a pause stops the clock. */
  | { mode: "duration"; remainingMs: number; totalMs: number }
  /** Stops where the chapter playing ends. */
  | { mode: "chapter" };

export const SLEEP_TIMER_OFF: SleepTimer = { mode: "off" };

export const sleepTimerForMinutes = (minutes: number): SleepTimer => ({
  mode: "duration",
  remainingMs: minutes * 60_000,
  totalMs: minutes * 60_000,
});

export interface SleepTick {
  timer: SleepTimer;
  /** The volume to play at, 1 outside the fade. */
  volume: number;
  /** Time is up: pause now. */
  expired: boolean;
}

/** The volume for how long is left: a straight fade over the last stretch. */
export const fadeVolume = (remainingMs: number) =>
  Math.min(Math.max(remainingMs / AUDIOBOOK_SLEEP_FADE_MS, 0), 1);

/**
 * Advances a duration timer by the time played since the last tick. A late
 * tick counts for at most AUDIOBOOK_SLEEP_MAX_TICK_MS.
 */
export const tickDurationTimer = (
  timer: SleepTimer,
  elapsedMs: number,
): SleepTick => {
  if (timer.mode !== "duration") {
    return { timer, volume: 1, expired: false };
  }
  const counted = Math.min(Math.max(elapsedMs, 0), AUDIOBOOK_SLEEP_MAX_TICK_MS);
  const remainingMs = Math.max(timer.remainingMs - counted, 0);
  if (remainingMs <= 0) {
    return { timer: SLEEP_TIMER_OFF, volume: 1, expired: true };
  }
  return {
    timer: { ...timer, remainingMs },
    volume: fadeVolume(remainingMs),
    expired: false,
  };
};

/**
 * Checks an end of chapter timer at a position in the book. `rate` turns
 * book seconds into the time it takes to hear them, for the fade.
 */
export const tickChapterTimer = (
  bookPosition: number,
  chapterEnd: number,
  rate: number,
): { volume: number; expired: boolean } => {
  // A progress report comes about once a second, so stop half a second early
  // rather than half a second into the next chapter.
  const remainingSeconds = chapterEnd - bookPosition - 0.5;
  if (remainingSeconds <= 0) return { volume: 1, expired: true };
  return {
    volume: fadeVolume((remainingSeconds * 1000) / Math.max(rate, 0.1)),
    expired: false,
  };
};

/**
 * Seconds to go back when playback resumes after a pause of `pausedForMs`, 0
 * for a short one.
 */
export const autoRewindSeconds = (pausedForMs: number): number =>
  AUDIOBOOK_AUTO_REWIND_STEPS.find((step) => pausedForMs >= step.pausedForMs)
    ?.seconds ?? 0;
