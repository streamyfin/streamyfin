import {
  isPlaceholderTick,
  resolveSessionPositionTicks,
} from "./sessionPosition";

/** 19m 18s. */
const RESUME_TICKS = 11_580_000_000;

describe("isPlaceholderTick", () => {
  test("drops a tick at 0 for a session that resumes further in", () => {
    expect(isPlaceholderTick(0, RESUME_TICKS, false)).toBe(true);
  });

  test("keeps a tick at 0 for a session that starts at the beginning", () => {
    expect(isPlaceholderTick(0, 0, false)).toBe(false);
  });

  test("keeps the first position MPV reaches, even short of the start position", () => {
    // A keyframe seek lands before the requested position.
    expect(isPlaceholderTick(1_154.2, RESUME_TICKS, false)).toBe(false);
  });

  test("keeps a tick at 0 once the session has a position", () => {
    // The user seeked back to the start.
    expect(isPlaceholderTick(0, RESUME_TICKS, true)).toBe(false);
  });

  test("drops a position that is not a number", () => {
    expect(isPlaceholderTick(Number.NaN, RESUME_TICKS, false)).toBe(true);
  });
});

describe("resolveSessionPositionTicks", () => {
  test("is the start position until MPV has reported one", () => {
    expect(
      resolveSessionPositionTicks({
        hasLivePosition: false,
        positionMs: 0,
        startTicks: RESUME_TICKS,
      }),
    ).toBe(RESUME_TICKS);
  });

  test("ignores whatever the tracked position holds before then", () => {
    // The controls seed it with the item's stored resume point, which is not
    // where a stream re-negotiated mid-playback starts.
    expect(
      resolveSessionPositionTicks({
        hasLivePosition: false,
        positionMs: 60_000,
        startTicks: RESUME_TICKS,
      }),
    ).toBe(RESUME_TICKS);
  });

  test("is the tracked position afterwards", () => {
    expect(
      resolveSessionPositionTicks({
        hasLivePosition: true,
        positionMs: 1_200_000,
        startTicks: RESUME_TICKS,
      }),
    ).toBe(12_000_000_000);
  });

  test("is 0 after a seek back to the start", () => {
    expect(
      resolveSessionPositionTicks({
        hasLivePosition: true,
        positionMs: 0,
        startTicks: RESUME_TICKS,
      }),
    ).toBe(0);
  });
});
