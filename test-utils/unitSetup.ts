/**
 * Jest `setupFilesAfterEnv` for the unit specs. These app modules are mocked
 * by resolved path, not through `moduleNameMapper`: a mapper entry matches the
 * specifier only, so a relative import (`./useNetworkStatus`) would keep the
 * real module. A spec that needs other behaviour declares its own
 * `jest.mock`, which replaces these. `jest.perf.config.js` sets its own
 * `setupFilesAfterEnv`, so the perf scenarios measure the real modules.
 */
jest.mock("@/utils/atoms/settings", () =>
  jest.requireActual("@/test-utils/settings").makeSettingsModule(),
);
jest.mock(
  "@/components/common/ServerImage",
  () => jest.requireActual("@/test-utils/serverImage").serverImageModule,
);
jest.mock(
  "@/hooks/useNetworkStatus",
  () => jest.requireActual("@/test-utils/appProviders").networkStatusModule,
);
jest.mock("@/providers/JellyfinProvider", () =>
  jest.requireActual("@/test-utils/jellyfinProviderModule"),
);
jest.mock("@/utils/customHeaders", () =>
  jest.requireActual("@/test-utils/customHeaders").customHeadersModule(),
);
jest.mock(
  "@/utils/log",
  () => jest.requireActual("@/test-utils/log").silentLogModule,
);

jest.mock("@/utils/device", () => ({ getOrSetDeviceId: () => "device-1" }));
jest.mock(
  "@/hooks/useHaptic",
  () => jest.requireActual("@/test-utils/haptic").silentHapticModule,
);
jest.mock(
  "@/hooks/useAppRouter",
  () => jest.requireActual("@/test-utils/stubModules").appRouterModule,
);
jest.mock(
  "@/components/BitrateSelector",
  () => jest.requireActual("@/test-utils/stubModules").bitrateSelectorModule,
);
jest.mock(
  "@/providers/InactivityProvider",
  () => jest.requireActual("@/test-utils/stubModules").inactivityModule,
);
jest.mock(
  "expo-secure-store",
  () => jest.requireActual("@/test-utils/secureStore").secureStoreModule,
);
