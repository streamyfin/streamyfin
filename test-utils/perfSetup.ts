/**
 * Jest `setupFilesAfterEnv` for the perf specs (`*.perf-test.tsx`), wired in
 * by `jest.perf.config.js`. The mocks are registered before the component
 * under test is required, and the fake timers wrap each scenario. A perf spec
 * declares only the mocks that are its own.
 */
// FlashList measures natively; its Jest setup stubs the measurements.
require("@shopify/flash-list/jestSetup");

jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);
jest.mock(
  "react-native-reanimated",
  () => jest.requireActual("@/test-utils/reanimated").reanimatedModule,
);
jest.mock("expo-key-event", () => ({
  useKeyEventListener: () => {},
}));
jest.mock("expo-brightness", () => ({
  getBrightnessAsync: async () => 0.5,
  setBrightnessAsync: async () => {},
  isAvailableAsync: async () => true,
}));
jest.mock("react-native-volume-manager", () => {
  const api = {
    getVolume: async () => ({ volume: 0.5 }),
    setVolume: async () => {},
    addVolumeListener: () => ({ remove: () => {} }),
    showNativeVolumeUI: () => {},
  };
  return {
    ...api,
    VolumeManager: api,
    default: api,
  };
});
jest.mock("expo-linear-gradient", () => {
  const { View } = require("react-native");
  return { LinearGradient: View };
});
jest.mock("react-native-device-info", () => ({
  getFreeDiskStorage: async () => 10_000_000_000,
  getTotalDiskCapacity: async () => 64_000_000_000,
}));
jest.mock("react-native-awesome-slider", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    Slider: (props: any) =>
      React.createElement(View, { testID: "slider", ...props }),
  };
});
jest.mock("sonner-native", () => ({
  toast: { error: jest.fn(), success: jest.fn(), info: jest.fn() },
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: "3rdParty", init: () => {} },
}));
jest.mock("@/i18n", () => ({
  default: {
    t: (key: string) => key,
    use: () => ({ init: () => {} }),
    changeLanguage: async () => {},
  },
}));
jest.mock("@gorhom/bottom-sheet", () =>
  jest.requireActual("@gorhom/bottom-sheet/mock"),
);
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/components/common/ItemActionSheetHost", () => ({
  ItemActionSheetHost: () => null,
}));
jest.mock("@/components/common/TouchableItemRouter", () => ({
  getItemNavigation: () => "/items/page",
  itemRouter: () => "/items/page",
}));
jest.mock("@/components/common/GlassSurface", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    GlassSurface: ({ children, ...props }: any) =>
      React.createElement(View, props, children),
  };
});
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
jest.mock("expo-router/react-navigation", () => ({
  useHeaderHeight: () => 64,
}));
jest.mock("@/hooks/useAppRouter", () => () => ({
  push: () => {},
  replace: () => {},
}));
jest.mock(
  "@/components/common/ServerImage",
  () => jest.requireActual("@/test-utils/serverImage").serverImageModule,
);
jest.mock("@/hooks/useHaptic", () => ({
  useHaptic: () => () => {},
}));
jest.mock("@/modules/glass-poster", () => {
  const { View } = require("react-native");
  return {
    GlassPosterView: View,
    isGlassEffectAvailable: () => false,
  };
});
jest.mock("@/modules", () => {
  const React = require("react");
  const { View } = require("react-native");
  return {
    HeroCarouselView: (props: any) =>
      React.createElement(View, { testID: "hero-carousel", ...props }),
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
jest.mock("react-native-gesture-handler", () => {
  const pan = {
    activeOffsetY: () => pan,
    onUpdate: () => pan,
    onEnd: () => pan,
  };
  const { View } = require("react-native");
  return {
    GestureDetector: ({ children }: any) => children,
    Gesture: {
      Pan: () => pan,
    },
    Pressable: View,
  };
});
// Installed from GitHub without its built `lib/`, so there is no file for Jest to
// resolve; a virtual mock stands in.
jest.mock(
  "react-native-track-player",
  () => ({
    __esModule: true,
    Capability: {},
    RepeatMode: { Off: 0, Track: 1, Queue: 2 },
    default: {
      setupPlayer: async () => undefined,
      updateOptions: async () => undefined,
      setRepeatMode: async () => undefined,
      setVolume: async () => undefined,
      play: async () => undefined,
      pause: async () => undefined,
      seekTo: async () => undefined,
      getProgress: async () => ({ position: 0, duration: 0, buffered: 0 }),
      getQueue: async () => [],
      getActiveTrackIndex: async () => 0,
      getActiveTrack: async () => undefined,
      reset: async () => {},
      add: async () => 0,
      skip: async () => {},
      skipToNext: async () => {},
      skipToPrevious: async () => {},
    },
  }),
  { virtual: true },
);

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ["performance"] });
});

afterEach(() => {
  jest.useRealTimers();
});
