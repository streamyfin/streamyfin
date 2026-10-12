import { applyLoadEvent, type LoadEventSession } from "./applyLoadEvent";
import { applyProgressTick } from "./applyProgressTick";

// A session as beginSession creates it, waiting for its stream.
const fresh = (): LoadEventSession & {
  positionMs: number;
  lastProgressReportAt: number;
} => ({
  awaitingLoad: true,
  isMuted: false,
  isPlaying: false,
  hasPlaybackStarted: false,
  positionMs: 0,
  lastProgressReportAt: 0,
});

describe("applyLoadEvent", () => {
  test("a stream swapped in while the player plays reports its progress", () => {
    // No pause or resume happens across the swap, so onLoad is the only
    // place the new session learns it is playing.
    const s = fresh();
    applyLoadEvent(s, { muted: false, isPlaying: true });
    expect(s).toMatchObject({
      awaitingLoad: false,
      isPlaying: true,
      hasPlaybackStarted: true,
    });
    expect(
      applyProgressTick(s, { position: 2400, didSeek: true }, 1_000, 10_000),
    ).toBe(true);
  });

  test("a stream loaded paused has not started", () => {
    const s = fresh();
    applyLoadEvent(s, { isPlaying: false });
    expect(s.isPlaying).toBe(false);
    expect(s.hasPlaybackStarted).toBe(false);
  });

  test("leaves the play state alone when the engine does not send it", () => {
    const s = fresh();
    applyLoadEvent(s, { muted: true });
    expect(s).toMatchObject({
      awaitingLoad: false,
      isMuted: true,
      isPlaying: false,
      hasPlaybackStarted: false,
    });
  });
});
