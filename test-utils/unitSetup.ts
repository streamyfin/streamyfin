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
