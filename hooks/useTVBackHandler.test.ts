import { stubReactNative } from "@/test-utils/reactNative";

// Stub the router module: only
// the pure route helpers are under test here.
stubReactNative({ isTV: true });
jest.mock("expo-router", () => ({
  useSegments: () => [],
}));

import { isAtTabRoot, isTabRoute } from "./useTVBackHandler";

describe("isAtTabRoot", () => {
  test("true at the root of a tab", () => {
    expect(isAtTabRoot(["(auth)", "(tabs)", "(home)"])).toBe(true);
    expect(isAtTabRoot(["(auth)", "(tabs)", "(settings)"])).toBe(true);
  });

  test("false on routes deeper than a tab root", () => {
    expect(isAtTabRoot(["(auth)", "(tabs)", "(home)", "items", "123"])).toBe(
      false,
    );
  });

  test("false on the tabs placeholder route (segments never contain 'index')", () => {
    // app/(auth)/(tabs)/index.tsx: expo-router pops a trailing "index"
    // segment, so the placeholder yields ["(auth)", "(tabs)"]. The navigator
    // immediately redirects to (home), so it is not treated as a tab root.
    expect(isAtTabRoot(["(auth)", "(tabs)"])).toBe(false);
  });

  test("false with no segments", () => {
    expect(isAtTabRoot([])).toBe(false);
  });
});

describe("isTabRoute", () => {
  test("matches tab group segments only", () => {
    expect(isTabRoute("(home)")).toBe(true);
    expect(isTabRoute("(tabs)")).toBe(false);
    expect(isTabRoute("index")).toBe(false);
  });
});
