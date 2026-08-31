import { describe, expect, test } from "bun:test";
import { resolveFinalPositionMs } from "./resolveFinalPositionMs";

const MIN = 60_000;

describe("resolveFinalPositionMs", () => {
  test("keeps the tracked position when the native side sends nothing", () => {
    expect(resolveFinalPositionMs(20 * MIN, undefined)).toBe(20 * MIN);
  });

  test("floors a native 0 if a teardown ever hands one back again", () => {
    // Regression floor, not a live path: the exit-after-pause bug was a native
    // 0 (unseeded engine cache on iOS, post-stop tick on Android), both closed
    // at the source, so onDismiss cannot carry 0 after the first tick today.
    expect(resolveFinalPositionMs(20 * MIN, 0)).toBe(20 * MIN);
  });

  test("floors a near-zero residual the same way", () => {
    // Closing the source does not make the floor conditional on an exact 0.
    expect(resolveFinalPositionMs(20 * MIN, 0.083)).toBe(20 * MIN);
  });

  test("floors a native value that lags the tracked one", () => {
    // Exit right after resuming: both sides are seeded with the resume point,
    // so reaching this input also takes a regression; the floor covers it.
    expect(resolveFinalPositionMs(15 * MIN, 2)).toBe(15 * MIN);
  });

  test("discards a native value that is minutes behind the tracked one", () => {
    // The design statement: however plausible a low native value looks, the
    // tracked position wins, because nothing moves playback backwards without
    // the seek's own onProgress landing first.
    expect(resolveFinalPositionMs(20 * MIN, 300)).toBe(20 * MIN);
  });

  test("takes a native reading ahead of the tracked one", () => {
    // Floor in the other direction: if the segment check ever moves back in
    // front of the progress emit, the tick that triggers an auto-skip reports
    // the pre-skip position after the skip's seek has moved the native
    // position to the segment end, and an exit before the next tick must
    // still report the end. The pair with the case above is what pins the
    // max: neither side always wins.
    expect(resolveFinalPositionMs(65_000, 150)).toBe(150_000);
  });

  test("reports 0 for a genuine stop at the start", () => {
    expect(resolveFinalPositionMs(0, 0)).toBe(0);
  });

  test("reports a backward seek that the user exits straight after", () => {
    // The seek's own onProgress already moved the tracked position back to
    // 1:00, so nothing here can resurrect the pre-seek position; a native
    // reading a fraction ahead is simply the later of the two.
    expect(resolveFinalPositionMs(60_000, 60.2)).toBe(60_200);
  });

  test("ignores a non-finite native value", () => {
    expect(resolveFinalPositionMs(20 * MIN, Number.NaN)).toBe(20 * MIN);
    expect(resolveFinalPositionMs(20 * MIN, Number.POSITIVE_INFINITY)).toBe(
      20 * MIN,
    );
  });

  test("never returns a non-finite or negative position", () => {
    // Both inputs are native event payloads; a NaN out of here would collapse
    // to PositionTicks 0 in msToTicks, and an Infinity would pass through it.
    expect(resolveFinalPositionMs(Number.NaN, 600)).toBe(600_000);
    expect(resolveFinalPositionMs(Number.NaN, undefined)).toBe(0);
    expect(resolveFinalPositionMs(-5_000, undefined)).toBe(0);
  });
});
