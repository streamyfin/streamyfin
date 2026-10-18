import { useEffect } from "react";

/**
 * An `expo-router` module double for perf scenarios: a screen rendered on its
 * own, with no navigator above it. A spec that needs route params spreads it
 * and overrides `useLocalSearchParams`.
 */
export const expoRouterModule = {
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
