import { AppState, Platform } from "react-native";

type PlatformOverrides = {
  OS?: "ios" | "android";
  isTV?: boolean;
};

type AppStateListener = (state: string) => void;

const appStateListeners: AppStateListener[] = [];
let appStateRemovals = 0;

/** Wakes the app the way `AppState` would, for specs driving foreground work. */
export const emitAppState = (state: string) => {
  for (const listener of [...appStateListeners]) listener(state);
};

/** How many `AppState` subscriptions have been removed, for cleanup assertions. */
export const appStateRemovalCount = () => appStateRemovals;

/**
 * jest-expo loads the real react-native, so a spec that needs a specific
 * platform patches the Platform values in place rather than replacing the
 * module, and routes `AppState` subscriptions through the listeners above so
 * the spec can wake the app. Jest gives each test file its own module
 * registry, so the patch never leaks into another spec.
 */
export const stubReactNative = (overrides: PlatformOverrides = {}) => {
  const OS = overrides.OS ?? "ios";

  appStateListeners.length = 0;
  appStateRemovals = 0;

  Object.defineProperty(Platform, "OS", { value: OS, configurable: true });
  Object.defineProperty(Platform, "isTV", {
    value: overrides.isTV ?? false,
    configurable: true,
  });
  Object.defineProperty(AppState, "addEventListener", {
    configurable: true,
    writable: true,
    value: (event: string, listener: AppStateListener) => {
      if (event === "change") appStateListeners.push(listener);
      return {
        remove() {
          appStateRemovals += 1;
          const at = appStateListeners.indexOf(listener);
          if (at !== -1) appStateListeners.splice(at, 1);
        },
      };
    },
  });
};
