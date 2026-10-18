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

jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);
jest.mock("sonner-native", () => ({
  toast: { error: jest.fn(), success: jest.fn(), info: jest.fn() },
}));
jest.mock(
  "react-native-safe-area-context",
  () => jest.requireActual("react-native-safe-area-context/jest/mock").default,
);
jest.mock(
  "react-native-reanimated",
  () => jest.requireActual("@/test-utils/reanimated").reanimatedModule,
);
jest.mock("react-native-device-info", () => ({
  getFreeDiskStorage: async () => 10_000_000_000,
  getTotalDiskCapacity: async () => 64_000_000_000,
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: "3rdParty", init: () => {} },
}));
jest.mock("@gorhom/bottom-sheet", () =>
  jest.requireActual("@gorhom/bottom-sheet/mock"),
);
jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  const { makeApi } = jest.requireActual("@/test-utils/jellyfinApi");
  return {
    apiAtom: atom(makeApi()),
    userAtom: atom({ Id: "user-1" }),
    pendingAccountSaveAtom: atom(false),
  };
});
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
    },
  };
});

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ["performance"] });
});

afterEach(() => {
  jest.useRealTimers();
});
