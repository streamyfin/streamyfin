import { describe, expect, test } from "bun:test";
import {
  applyPlaybackEnded,
  type PlaybackEndedSession,
} from "./applyPlaybackEnded";

const session = (
  overrides: Partial<PlaybackEndedSession> = {},
): PlaybackEndedSession => ({
  positionMs: 600_000,
  awaitingLoad: false,
  ...overrides,
});

describe("applyPlaybackEnded", () => {
  test("moves the tracked position to where the stream ended", () => {
    const s = session();
    expect(applyPlaybackEnded(s, 2_640.5)).toBe(true);
    expect(s.positionMs).toBe(2_640_500);
  });

  test("ignores the outgoing stream's end of file during an in-place swap", () => {
    // The incoming session still sits at its seeded start; the event carries
    // the outgoing stream's final position and must not land on it.
    const s = session({ positionMs: 0, awaitingLoad: true });
    expect(applyPlaybackEnded(s, 2_640.5)).toBe(false);
    expect(s.positionMs).toBe(0);
  });

  test("ignores the event when no session is active", () => {
    expect(applyPlaybackEnded(null, 2_640.5)).toBe(false);
    expect(applyPlaybackEnded(undefined, 2_640.5)).toBe(false);
  });
});
