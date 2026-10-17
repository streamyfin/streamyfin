import { applyLoadEvent, type LoadEventSession } from "./applyLoadEvent";
import { applyProgressTick } from "./applyProgressTick";

const NEW_URL = "http://host/Videos/new/stream.mkv?AudioStreamIndex=2";
const OLD_URL = "http://host/Videos/old/stream.mkv?AudioStreamIndex=2";

// A session as beginSession creates it, waiting for its stream.
const fresh = (): LoadEventSession & {
  positionMs: number;
  lastProgressReportAt: number;
} => ({
  stream: { url: NEW_URL },
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
    applyLoadEvent(s, { url: NEW_URL, muted: false, isPlaying: true });
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
    applyLoadEvent(s, { url: NEW_URL, isPlaying: false });
    expect(s.isPlaying).toBe(false);
    expect(s.hasPlaybackStarted).toBe(false);
  });

  test("leaves the play state alone when the engine does not send it", () => {
    const s = fresh();
    applyLoadEvent(s, { url: NEW_URL, muted: true });
    expect(s).toMatchObject({
      awaitingLoad: false,
      isMuted: true,
      isPlaying: false,
      hasPlaybackStarted: false,
    });
  });

  test("a late onLoad from the outgoing stream leaves the new session waiting", () => {
    // An in-place swap can deliver the old stream's onLoad after the new
    // session began. Taking it would open the progress gate, and the old
    // stream's ticks would move and report the new item's position.
    const s = fresh();
    expect(
      applyLoadEvent(s, { url: OLD_URL, muted: true, isPlaying: true }),
    ).toBe(false);
    expect(s).toMatchObject({
      awaitingLoad: true,
      isMuted: false,
      isPlaying: false,
      hasPlaybackStarted: false,
    });

    expect(applyLoadEvent(s, { url: NEW_URL, isPlaying: true })).toBe(true);
    expect(s).toMatchObject({ awaitingLoad: false, hasPlaybackStarted: true });
  });

  test("takes an event without a URL, as every onLoad was taken before", () => {
    const s = fresh();
    expect(applyLoadEvent(s, { isPlaying: true })).toBe(true);
    expect(s.awaitingLoad).toBe(false);
  });
});
