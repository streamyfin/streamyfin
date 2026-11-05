import { expoRouterModule, router } from "./expoRouter";

// The expo-router surface Jest sees: its real package ships ESM sources Jest
// does not transform, so screens and shared modules map here instead. A spec
// needing a different shape still wins with a local jest.mock.
export const {
  useRouter,
  useSegments,
  useNavigation,
  useLocalSearchParams,
  useGlobalSearchParams,
  useFocusEffect,
} = expoRouterModule;
export { router };
