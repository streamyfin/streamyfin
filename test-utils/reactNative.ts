import { mock } from "bun:test";

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
 * `bun:test` cannot load react-native, so specs stub it. `mock.module` is
 * global and re-links every importer, so all of them must publish the same
 * export surface: a stub missing one name breaks whichever file links after it.
 * Only the Platform values differ per spec.
 */
export const stubReactNative = (overrides: PlatformOverrides = {}) => {
  const OS = overrides.OS ?? "ios";

  appStateListeners.length = 0;
  appStateRemovals = 0;

  return mock.module("react-native", () => ({
    Platform: {
      OS,
      isTV: overrides.isTV ?? false,
      select: (spec: Record<string, unknown>) => spec[OS] ?? spec.default,
    },
    BackHandler: { addEventListener: () => ({ remove() {} }) },
    AppState: {
      addEventListener: (event: string, listener: AppStateListener) => {
        if (event === "change") appStateListeners.push(listener);
        return {
          remove() {
            appStateRemovals += 1;
            const at = appStateListeners.indexOf(listener);
            if (at !== -1) appStateListeners.splice(at, 1);
          },
        };
      },
    },
    NativeModules: {},
    TurboModuleRegistry: { get: () => null, getEnforcing: () => ({}) },
  }));
};
