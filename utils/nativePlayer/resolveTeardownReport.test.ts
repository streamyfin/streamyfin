import { describe, expect, test } from "bun:test";
import { resolveTeardownReport } from "./resolveTeardownReport";

describe("resolveTeardownReport", () => {
  test("reports nothing for a session that never committed", () => {
    // The onDismiss position is the outgoing episode's end; the incoming
    // session still sits at its seed and never sent a start report.
    expect(
      resolveTeardownReport(
        { committed: false, awaitingLoad: true, positionMs: 0 },
        2_518,
      ),
    ).toBeNull();
  });

  test("reports nothing even after onPlaybackEnded moved the tracked position", () => {
    // Gating only the onPlaybackEnded write was not enough: both readings
    // belong to the outgoing stream.
    expect(
      resolveTeardownReport(
        { committed: false, awaitingLoad: true, positionMs: 2_518_000 },
        2_518,
      ),
    ).toBeNull();
  });

  test("reports the tracked position while the committed stream is still loading", () => {
    // present()/load() resolved (start report sent at the seed) but onLoad
    // has not arrived, so the native position is still the outgoing stream's.
    expect(
      resolveTeardownReport(
        { committed: true, awaitingLoad: true, positionMs: 300_000 },
        2_518,
      ),
    ).toBe(300_000);
  });

  test("takes the later of the tracked and native positions once loaded", () => {
    expect(
      resolveTeardownReport(
        { committed: true, awaitingLoad: false, positionMs: 1_200_000 },
        1_200.5,
      ),
    ).toBe(1_200_500);
    expect(
      resolveTeardownReport(
        { committed: true, awaitingLoad: false, positionMs: 1_200_000 },
        undefined,
      ),
    ).toBe(1_200_000);
  });
});
