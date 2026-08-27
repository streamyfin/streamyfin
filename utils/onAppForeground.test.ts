import { describe, expect, test } from "bun:test";
import {
  appStateRemovalCount,
  emitAppState,
  stubReactNative,
} from "@/test-utils/reactNative";

stubReactNative();

const { onAppForeground } = await import("./onAppForeground");

describe("onAppForeground", () => {
  test("runs the callback the caller holds now, not the one it held then", () => {
    // The listener is registered once and lives for the process, so resolving
    // the callback at registration is how a stale api survives an account
    // switch: the refresh keeps going to the previous server with the previous
    // token, and comes back 401 on a server the user has left.
    const calls: string[] = [];
    let current = () => calls.push("first");

    const stop = onAppForeground(() => current);

    emitAppState("active");
    current = () => calls.push("second");
    emitAppState("active");

    expect(calls).toEqual(["first", "second"]);
    stop();
  });

  test("ignores every state that is not active", () => {
    const calls: string[] = [];
    const stop = onAppForeground(() => () => calls.push("ran"));

    emitAppState("background");
    emitAppState("inactive");

    expect(calls).toEqual([]);
    stop();
  });

  test("survives having nothing to call", () => {
    // The ref is empty until the first render settles, and a wake in that
    // window must not take the app down.
    const stop = onAppForeground(() => undefined);

    expect(() => emitAppState("active")).not.toThrow();
    stop();
  });

  test("unsubscribes", () => {
    const before = appStateRemovalCount();

    onAppForeground(() => undefined)();

    expect(appStateRemovalCount()).toBe(before + 1);
  });
});
