import { describe, expect, mock, spyOn, test } from "bun:test";
import { createGroupRejoin } from "./groupRejoin";

describe("SyncPlay membership reconnect ownership", () => {
  test("a failed rejoin does not mark the new socket as successfully joined", async () => {
    const join = mock(async (_group: string, _signal: AbortSignal) => {});
    join.mockRejectedValueOnce(new Error("temporary failure"));
    const logged = spyOn(console, "error").mockImplementation(() => {});
    const tracker = createGroupRejoin(join);
    try {
      const replacement = {};
      tracker.update("group", {}, true);
      tracker.update("group", replacement, true);
      await Promise.resolve();
      tracker.update("group", replacement, true);
      expect(join).toHaveBeenCalledTimes(2);
    } finally {
      tracker.dispose();
      logged.mockRestore();
    }
  });

  test("rejoins after a replaced socket opens, even if the old close arrived after foreground", () => {
    const join = mock(async (_group: string, _signal: AbortSignal) => {});
    const tracker = createGroupRejoin(join);
    const original = {};
    const replacement = {};
    tracker.update("group", original, true);
    tracker.update("group", original, false);
    tracker.update("group", replacement, false);
    expect(join).not.toHaveBeenCalled();
    tracker.update("group", replacement, true);
    expect(join).toHaveBeenCalledTimes(1);
    expect(join.mock.calls[0][0]).toBe("group");
    tracker.update("group", replacement, true);
    expect(join).toHaveBeenCalledTimes(1);
    tracker.dispose();
  });

  test("foreground with the same live socket does not rejoin", () => {
    const join = mock(async () => {});
    const tracker = createGroupRejoin(join);
    const socket = {};
    tracker.update("group", socket, true);
    tracker.update("group", socket, true);
    expect(join).not.toHaveBeenCalled();
    tracker.dispose();
  });

  test("leaving, changing groups and provider disposal cancel old in-flight joins", () => {
    const join = mock(async (_group: string, _signal: AbortSignal) => {});
    const tracker = createGroupRejoin(join);
    const original = {};
    const next = {};
    tracker.update("group", original, true);
    tracker.update("group", next, true);
    const signal = join.mock.calls[0][1];
    tracker.update(null, next, true);
    expect(signal.aborted).toBe(true);
    tracker.update("other", next, true);
    tracker.update("other", {}, true);
    const second = join.mock.calls[1][1];
    tracker.dispose();
    expect(second.aborted).toBe(true);
  });
});
