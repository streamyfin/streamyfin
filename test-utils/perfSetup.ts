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
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
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
jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  const { makeApi } = jest.requireActual("@/test-utils/jellyfinApi");
  return {
    apiAtom: atom(makeApi()),
    userAtom: atom({ Id: "user-1" }),
    pendingAccountSaveAtom: atom(false),
  };
});
jest.mock("expo-router", () => ({
  useSegments: () => ["(auth)", "(tabs)"],
  useNavigation: () => ({
    setOptions: () => {},
    addListener: () => () => {},
  }),
}));
jest.mock("@/hooks/useAppRouter", () => () => ({ push: () => {} }));
jest.mock(
  "@/components/common/ServerImage",
  () => jest.requireActual("@/test-utils/serverImage").serverImageModule,
);

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ["performance"] });
});

afterEach(() => {
  jest.useRealTimers();
});
