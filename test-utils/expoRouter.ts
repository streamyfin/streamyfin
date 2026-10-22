import { createContext, useEffect } from "react";

/**
 * What the screens under test navigate with. `useAppRouter` wraps this one, so
 * a scenario can assert where a press would have gone:
 * `expect(router.push).toHaveBeenCalledWith(...)`.
 */
export const router = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  navigate: jest.fn(),
  setParams: jest.fn(),
  dismiss: jest.fn(),
  canGoBack: () => false,
};

/**
 * An `expo-router` module double for perf scenarios: a screen rendered on its
 * own, with no navigator above it. A spec that needs route params spreads it
 * and overrides `useLocalSearchParams`.
 */
export const expoRouterModule = {
  useRouter: () => router,
  useSegments: () => ["(auth)", "(tabs)"],
  useNavigation: () => ({
    setOptions: () => {},
    addListener: () => () => {},
    getState: () => ({ routes: [] }),
    reset: () => {},
  }),
  useLocalSearchParams: () => ({}),
  useGlobalSearchParams: () => ({}),
  useFocusEffect: (callback: () => undefined | (() => void)) => {
    useEffect(() => callback?.(), [callback]);
  },
};

/** `expo-router/react-navigation`, with no navigator, so no navigation context. */
export const reactNavigationModule = {
  NavigationContext: createContext(undefined),
  useHeaderHeight: () => 64,
};
