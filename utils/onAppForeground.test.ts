import {
  appStateRemovalCount,
  emitAppState,
  stubReactNative,
} from "@/test-utils/reactNative";

import { onAppForeground } from "./onAppForeground";

// AppState is read when a listener is added, so patching it here, after the
// imports, still reaches the module under test.
stubReactNative();

describe("onAppForeground", () => {
  test("runs the callback each time the app comes back", () => {
    const calls: string[] = [];
    const stop = onAppForeground(() => calls.push("ran"));

    emitAppState("active");
    emitAppState("active");

    expect(calls).toEqual(["ran", "ran"]);
    stop();
  });

  test("ignores every state that is not active", () => {
    const calls: string[] = [];
    const stop = onAppForeground(() => calls.push("ran"));

    emitAppState("background");
    emitAppState("inactive");

    expect(calls).toEqual([]);
    stop();
  });

  test("unsubscribes", () => {
    const calls: string[] = [];
    const before = appStateRemovalCount();

    onAppForeground(() => calls.push("ran"))();
    emitAppState("active");

    expect(appStateRemovalCount()).toBe(before + 1);
    expect(calls).toEqual([]);
  });
});
