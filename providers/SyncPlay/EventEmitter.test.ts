import { describe, expect, spyOn, test } from "bun:test";
import {
  EventEmitter,
  EventWaitTimeoutError,
  throwIfAborted,
  waitForEventOnce,
} from "./EventEmitter";

describe("cancellable native player event waits", () => {
  test("subscribes before synchronous player callbacks and cleans up afterward", async () => {
    const events = new EventEmitter();
    const off = spyOn(events, "off");
    const result = waitForEventOnce(events, "pause", 50, ["playbackerror"]);
    events.emit("pause", "native");
    expect(await result).toEqual(["native"]);
    expect(off).toHaveBeenCalledWith("pause", expect.any(Function));
    expect(off).toHaveBeenCalledWith("playbackerror", expect.any(Function));
  });

  test("timeout removes listeners rather than leaving an old command attached", async () => {
    const events = new EventEmitter();
    const off = spyOn(events, "off");
    await expect(waitForEventOnce(events, "ready", 1)).rejects.toBeInstanceOf(
      EventWaitTimeoutError,
    );
    expect(off).toHaveBeenCalledWith("ready", expect.any(Function));
  });

  test("cancellation works with React Native's minimal AbortSignal API", async () => {
    const events = new EventEmitter();
    const controller = new AbortController();
    Object.defineProperty(controller.signal, "throwIfAborted", {
      value: undefined,
    });
    Object.defineProperty(controller.signal, "reason", { value: undefined });
    const result = waitForEventOnce(
      events,
      "ready",
      50,
      undefined,
      controller.signal,
    );
    controller.abort();
    await expect(result).rejects.toThrow("cancelled");
    expect(() => throwIfAborted(controller.signal)).toThrow("cancelled");
    events.emit("ready");
  });

  test("an error rejects the wait instead of falsely acknowledging readiness", async () => {
    const events = new EventEmitter();
    const failure = new Error("decoder failed");
    const result = waitForEventOnce(events, "ready", 50, ["playbackerror"]);
    events.emit("playbackerror", failure);
    await expect(result).rejects.toBe(failure);
  });
});
