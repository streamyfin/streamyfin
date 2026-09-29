import { describe, expect, test } from "bun:test";
import { createPlaybackStartGuard } from "./playbackStartGuard";

describe("playback startup", () => {
  for (const nativeAccepted of [true, false]) {
    test(`repeated taps during slow negotiation select only one player (native=${nativeAccepted})`, async () => {
      const start = createPlaybackStartGuard();
      const network = Promise.withResolvers<boolean>();
      let negotiations = 0;
      const players: string[] = [];
      const play = () =>
        start(async () => {
          negotiations++;
          players.push((await network.promise) ? "native" : "fallback");
        });

      const first = play();
      await Promise.all([play(), play(), play()]);
      expect(negotiations).toBe(1);
      expect(players).toEqual([]);
      network.resolve(nativeAccepted);
      await first;
      expect(players).toEqual([nativeAccepted ? "native" : "fallback"]);

      await play();
      expect(negotiations).toBe(2);
    });
  }

  test("a failed launch releases the guard so the user can retry", async () => {
    const start = createPlaybackStartGuard();
    await expect(
      start(async () => {
        throw new Error("offline");
      }),
    ).rejects.toThrow("offline");
    let retried = false;
    await start(async () => {
      retried = true;
    });
    expect(retried).toBe(true);
  });
});
