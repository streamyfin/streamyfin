import { renderHook } from "@testing-library/react-native";
import useAppRouter from "./useAppRouter";

const mockReplace = jest.fn();
let mockOffline = false;

jest.mock("expo-router", () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: jest.fn(),
    setParams: jest.fn(),
  }),
}));
jest.mock("expo-router/react-navigation", () => ({
  NavigationContext: jest.requireActual("react").createContext(undefined),
}));
jest.mock("@/providers/OfflineModeProvider", () => ({
  useOfflineMode: () => mockOffline,
}));

describe("useAppRouter replace", () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockOffline = false;
  });

  // The wrapper took the href alone, so `withAnchor` never reached Expo
  // Router: a page opened from a TV home screen tile replaced the whole Home
  // stack and Back had nowhere to go.
  test("hands the navigation options on with a string href", async () => {
    const { result } = await renderHook(() => useAppRouter());

    result.current.replace("/(auth)/(tabs)/(home)/series/abc" as never, {
      withAnchor: true,
    });

    expect(mockReplace).toHaveBeenCalledWith(
      "/(auth)/(tabs)/(home)/series/abc",
      { withAnchor: true },
    );
  });

  test("hands the navigation options on with an object href, next to the offline param", async () => {
    mockOffline = true;
    const { result } = await renderHook(() => useAppRouter());

    result.current.replace(
      { pathname: "/items/page", params: { id: "abc" } } as never,
      { withAnchor: true },
    );

    expect(mockReplace).toHaveBeenCalledWith(
      { pathname: "/items/page", params: { offline: "true", id: "abc" } },
      { withAnchor: true },
    );
  });

  test("still works without options", async () => {
    const { result } = await renderHook(() => useAppRouter());

    result.current.replace("/(auth)/(tabs)/(home)" as never);

    expect(mockReplace).toHaveBeenCalledWith(
      "/(auth)/(tabs)/(home)",
      undefined,
    );
  });
});
