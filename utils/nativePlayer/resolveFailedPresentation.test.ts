import { describe, expect, test } from "bun:test";
import { resolveFailedPresentation } from "./resolveFailedPresentation";

describe("resolveFailedPresentation", () => {
  test("leaves a session that is no longer current alone", () => {
    expect(
      resolveFailedPresentation({
        sessionIsCurrent: false,
        swapped: true,
        playerPresented: false,
      }),
    ).toBe("closed");
    expect(
      resolveFailedPresentation({
        sessionIsCurrent: false,
        swapped: false,
        playerPresented: true,
      }),
    ).toBe("closed");
  });

  test("restores the old session when a swap failed on a presented player", () => {
    expect(
      resolveFailedPresentation({
        sessionIsCurrent: true,
        swapped: true,
        playerPresented: true,
      }),
    ).toBe("restore");
  });

  test("clears the session when a swap failed because the player is gone", () => {
    // The race: the outgoing stream ended, or the user closed the player,
    // while the swap was in flight; load() rejected and no onDismiss follows.
    expect(
      resolveFailedPresentation({
        sessionIsCurrent: true,
        swapped: true,
        playerPresented: false,
      }),
    ).toBe("player-gone");
  });

  test("unpresents a first presentation that failed", () => {
    expect(
      resolveFailedPresentation({
        sessionIsCurrent: true,
        swapped: false,
        playerPresented: false,
      }),
    ).toBe("unpresented");
  });
});
