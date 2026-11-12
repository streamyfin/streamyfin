/**
 * Jest `setupFilesAfterEnv` for the perf specs (`*.perf-test.tsx`), wired in
 * by `jest.perf.config.js`. The mocks are registered before the component
 * under test is required, and the fake timers wrap each scenario. Only what
 * most scenarios need is here: a native module or a Jest gap. A perf spec
 * declares the mocks that are its own, and the app's own components render
 * for real so that their cost is measured.
 */
// FlashList measures natively; its Jest setup stubs the measurements.
require("@shopify/flash-list/jestSetup");
// The app's own i18n, so a translated string costs what it costs in the app.
// It must load in `beforeAll`, after the spec's own mocks: it reaches
// `expo-router` through `utils/log`, and a module this file requires caches
// the mock below over any `jest.mock("expo-router")` a spec declares.
beforeAll(() => {
  require("@/i18n");
});

// Loading the real module logs an Expo Go push warning on import.
jest.mock("expo-notifications", () => ({
  scheduleNotificationAsync: jest.fn(),
}));
jest.mock("sonner-native", () => ({
  toast: { error: jest.fn(), success: jest.fn(), info: jest.fn() },
}));
jest.mock(
  "react-native-safe-area-context",
  () => jest.requireActual("react-native-safe-area-context/jest/mock").default,
);
// MMKV is native. `jest.perf.config.js` maps none of the unit doubles, so this
// is the scenarios' only one, on the PR and on the baseline alike.
jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);
jest.mock(
  "react-native-reanimated",
  () => jest.requireActual("@/test-utils/reanimated").reanimatedModule,
);
jest.mock("@gorhom/bottom-sheet", () =>
  jest.requireActual("@gorhom/bottom-sheet/mock"),
);
jest.mock(
  "@/providers/JellyfinProvider",
  () =>
    jest.requireActual("@/test-utils/jellyfinProvider").jellyfinProviderModule,
);
jest.mock(
  "@/utils/atoms/api",
  () => jest.requireActual("@/test-utils/jellyfinProvider").apiAtomsModule,
);
jest.mock(
  "expo-router",
  () => jest.requireActual("@/test-utils/expoRouter").expoRouterModule,
);
jest.mock(
  "expo-router/react-navigation",
  () => jest.requireActual("@/test-utils/expoRouter").reactNavigationModule,
);
jest.mock("@/modules", () => {
  const { viewStub } = jest.requireActual("@/test-utils/viewStub");
  return {
    HeroCarouselView: viewStub("hero-carousel"),
    isHeroCarouselAvailable: () => true,
    BackgroundDownloader: {
      addStartedListener: () => ({ remove: () => {} }),
      addProgressListener: () => ({ remove: () => {} }),
      addCompleteListener: () => ({ remove: () => {} }),
      addErrorListener: () => ({ remove: () => {} }),
      setLiveActivityEnabled: () => {},
      pauseDownload: async () => "kept",
      resumeDownload: async () => 1,
      cancelPausedDownload: () => {},
    },
  };
});

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ["performance"] });
});

afterEach(() => {
  jest.useRealTimers();
});
