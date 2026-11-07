/**
 * Jest `setupFilesAfterEnv` for the unit specs. Every module mocked here is a
 * boundary: it reaches native code, IO, the keychain, the network or Sentry,
 * and its callers do not depend on its result. App logic is never mocked here:
 * a spec opts in with one `jest.mock` from `test-utils/`. A spec about one of
 * these modules calls `jest.unmock`. See `docs/conventions/testing.md`.
 * `jest.perf.config.js` sets its own `setupFilesAfterEnv`, so the perf
 * scenarios measure the real modules.
 */

// FlashList measures natively; the library's Jest setup stubs only that.
require("@shopify/flash-list/jestSetup");

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
jest.mock("i18next", () =>
  jest.requireActual("@/test-utils/i18next").identityI18nextModule(),
);
jest.mock("@sentry/react-native", () =>
  jest.requireActual("@/test-utils/sentry").sentryModule(),
);
jest.mock(
  "@expo/react-native-action-sheet",
  () => jest.requireActual("@/test-utils/actionSheet").actionSheetModule,
);
jest.mock("expo-blur", () =>
  jest.requireActual("@/test-utils/stubModules").blurModule(),
);
jest.mock(
  "react-native-qrcode-svg",
  () => jest.requireActual("@/test-utils/stubModules").qrCodeModule,
);
jest.mock(
  "expo-notifications",
  () => jest.requireActual("@/test-utils/notifications").notificationsModule,
);
jest.mock(
  "@expo/ui/swift-ui",
  () => jest.requireActual("@/test-utils/swiftUi").swiftUiModule,
);
jest.mock(
  "@expo/ui/swift-ui/modifiers",
  () => jest.requireActual("@/test-utils/swiftUi").swiftUiModifiersModule,
);
jest.mock(
  "@expo/ui/jetpack-compose",
  () => jest.requireActual("@/test-utils/jetpackCompose").jetpackComposeModule,
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
