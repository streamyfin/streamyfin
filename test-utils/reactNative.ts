import { Platform } from "react-native";

type PlatformOverrides = {
  OS?: "ios" | "android";
  isTV?: boolean;
};

/**
 * jest-expo loads the real react-native, so a spec that needs a specific
 * platform patches the Platform values in place rather than replacing the
 * module. Jest gives each test file its own module registry, so the patch never
 * leaks into another spec.
 */
export const stubReactNative = (overrides: PlatformOverrides = {}) => {
  const OS = overrides.OS ?? "ios";
  Object.defineProperty(Platform, "OS", { value: OS, configurable: true });
  Object.defineProperty(Platform, "isTV", {
    value: overrides.isTV ?? false,
    configurable: true,
  });
};
