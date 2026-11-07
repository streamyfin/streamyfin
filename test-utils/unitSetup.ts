/**
 * Jest `setupFilesAfterEnv` for the unit specs. These boundary modules reach
 * native code, IO, the keychain, the network or Sentry, and their callers do
 * not depend on their result. They are mocked by resolved path, not through
 * `moduleNameMapper`: a mapper entry matches the specifier only, so a relative
 * import would keep the real module. App logic is never mocked here: a spec
 * opts in with one `jest.mock` from `test-utils/`. A spec about one of
 * these modules calls `jest.unmock`. See `docs/conventions/testing.md`.
 * `jest.perf.config.js` sets its own `setupFilesAfterEnv`, so the perf
 * scenarios measure the real modules.
 */
jest.mock(
  "@/components/common/ServerImage",
  () => jest.requireActual("@/test-utils/serverImage").serverImageModule,
);
jest.mock(
  "@/utils/log",
  () => jest.requireActual("@/test-utils/log").silentLogModule,
);
jest.mock(
  "@/utils/device",
  () => jest.requireActual("@/test-utils/stubModules").deviceModule,
);
jest.mock(
  "@/hooks/useHaptic",
  () => jest.requireActual("@/test-utils/haptic").silentHapticModule,
);
jest.mock(
  "expo-secure-store",
  () => jest.requireActual("@/test-utils/secureStore").secureStoreModule,
);
jest.mock("@/utils/serverUrl/probes/jellyfin", () =>
  jest.requireActual("@/test-utils/stubModules").jellyfinProbeModule(),
);
jest.mock(
  "@/modules/wifi-ssid",
  () => jest.requireActual("@/test-utils/stubModules").wifiSsidModule,
);
