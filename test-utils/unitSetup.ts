/**
 * Jest `setupFilesAfterEnv` for the unit specs. Every module mocked here is a
 * boundary: it reaches native code, IO, the keychain, the network or Sentry,
 * and its callers do not depend on its result. App logic is never mocked here:
 * a spec opts in with one `jest.mock` from `test-utils/`. A spec about one of
 * these modules calls `jest.unmock`. See `docs/conventions/testing.md`.
 * `jest.perf.config.js` sets its own `setupFilesAfterEnv`, so the perf
 * scenarios measure the real modules.
 */

// Packages. Most package doubles are mapped in `jest.config.js`
// (`moduleNameMapper`); these are mocked here because their doubles are
// factories exported from `test-utils/` alongside the handles specs import.
jest.mock(
  "expo-secure-store",
  () => jest.requireActual("@/test-utils/secureStore").secureStoreModule,
);
jest.mock(
  "sonner-native",
  () => jest.requireActual("@/test-utils/toast").toastModule,
);
jest.mock(
  "expo-notifications",
  () => jest.requireActual("@/test-utils/notifications").notificationsModule,
);

// The app's own modules that wrap a boundary. They are mocked by resolved
// path, not through `moduleNameMapper`: a mapper entry matches the import
// specifier only, so a relative import would keep the real module.
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
  "@/hooks/useTVBackPress",
  () => jest.requireActual("@/test-utils/tvBackPress").tvBackPressModule,
);
jest.mock("@/utils/serverUrl/probes/jellyfin", () =>
  jest.requireActual("@/test-utils/stubModules").jellyfinProbeModule(),
);
jest.mock(
  "@/modules/wifi-ssid",
  () => jest.requireActual("@/test-utils/stubModules").wifiSsidModule,
);
