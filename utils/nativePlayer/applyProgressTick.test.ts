import { describe, expect, test } from "bun:test";
import {
  applyProgressTick,
  type ProgressTickSession,
} from "./applyProgressTick";

const INTERVAL = 10_000;

const session = (
  overrides: Partial<ProgressTickSession> = {},
): ProgressTickSession => ({
  positionMs: 600_000,
  lastProgressReportAt: 100_000,
  hasPlaybackStarted: true,
  ...overrides,
});

describe("applyProgressTick", () => {
  test("moves the tracked position on every tick", () => {
    const s = session();
    applyProgressTick(s, { position: 601 }, 100_500, INTERVAL);
    expect(s.positionMs).toBe(601_000);
  });

  test("holds the report until the interval has elapsed", () => {
    const s = session();
    expect(applyProgressTick(s, { position: 601 }, 109_999, INTERVAL)).toBe(
      false,
    );
    expect(s.lastProgressReportAt).toBe(100_000);
    expect(applyProgressTick(s, { position: 602 }, 110_000, INTERVAL)).toBe(
      true,
    );
    expect(s.lastProgressReportAt).toBe(110_000);
  });

  test("reports the first authoritative tick after a seek at once", () => {
    const s = session();
    expect(
      applyProgressTick(s, { position: 300, didSeek: true }, 100_500, INTERVAL),
    ).toBe(true);
    expect(s.positionMs).toBe(300_000);
    expect(s.lastProgressReportAt).toBe(100_500);
  });

  test("moves the position on a seek's synthetic tick without reporting it", () => {
    // The requested target, not where mpv landed: the report has to wait for
    // the authoritative tick, however long the interval gate has been open.
    const s = session({ lastProgressReportAt: 0 });
    expect(
      applyProgressTick(
        s,
        { position: 300, trackingOnly: true },
        100_500,
        INTERVAL,
      ),
    ).toBe(false);
    expect(s.positionMs).toBe(300_000);
    expect(s.lastProgressReportAt).toBe(0);
  });

  test("tracks but does not report before playback has started", () => {
    const s = session({ hasPlaybackStarted: false, lastProgressReportAt: 0 });
    expect(
      applyProgressTick(s, { position: 5, didSeek: true }, 100_500, INTERVAL),
    ).toBe(false);
    expect(s.positionMs).toBe(5_000);
    expect(s.lastProgressReportAt).toBe(0);
  });
});
