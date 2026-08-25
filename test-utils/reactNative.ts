import { mock } from "bun:test";

type PlatformOverrides = {
  OS?: "ios" | "android";
  isTV?: boolean;
};

/**
 * `bun:test` cannot load react-native, so specs stub it. `mock.module` is
 * global and re-links every importer, so all of them must publish the same
 * export surface: a stub missing one name breaks whichever file links after it.
 * Only the Platform values differ per spec.
 */
export const stubReactNative = (overrides: PlatformOverrides = {}) => {
  const OS = overrides.OS ?? "ios";

  return mock.module("react-native", () => ({
    Platform: {
      OS,
      isTV: overrides.isTV ?? false,
      select: (spec: Record<string, unknown>) => spec[OS] ?? spec.default,
    },
    BackHandler: { addEventListener: () => ({ remove() {} }) },
    NativeModules: {},
    TurboModuleRegistry: { get: () => null, getEnforcing: () => ({}) },
  }));
};
