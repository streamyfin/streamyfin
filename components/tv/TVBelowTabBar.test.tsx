import { render, renderHook, screen } from "@testing-library/react-native";
import { Platform, StyleSheet, Text } from "react-native";
import { TV_TOP_TAB_BAR_CLEARANCE } from "@/constants/TVSizes";
import { TVBelowTabBar, useTVBelowTabBarContentTop } from "./TVBelowTabBar";

// The real module loads the settings atoms; the area only needs the clearance.
jest.mock("@/constants/TVSizes", () => ({ TV_TOP_TAB_BAR_CLEARANCE: 70 }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 20, bottom: 0, left: 0, right: 0 }),
}));

const renderArea = () =>
  render(
    <TVBelowTabBar>
      <Text>Settings</Text>
    </TVBelowTabBar>,
  );

// The TV settings scrolled their text under the top tab bar, which has no
// background, and it read through the tab labels (seen on an Android TV,
// 2026-11-03).
test("on Android TV it starts below the tab bar and cuts off what scrolls above it", async () => {
  jest.replaceProperty(Platform, "OS", "android");
  await renderArea();

  const area = screen.getByTestId("tv-below-tab-bar");
  expect(area.props.style).toMatchObject({
    marginTop: 20 + TV_TOP_TAB_BAR_CLEARANCE,
    overflow: "hidden",
  });
  expect(screen.getByText("Settings")).toBeTruthy();
});

// That bar is Android TV's own: Apple TV's native tab bar is opaque and the
// page scrolls under it, so cutting the page there only hid rows.
test("on Apple TV it leaves the page as it was", async () => {
  jest.replaceProperty(Platform, "OS", "ios");
  await renderArea();

  const style = StyleSheet.flatten(
    screen.getByTestId("tv-below-tab-bar").props.style,
  );
  expect(style.marginTop).toBeUndefined();
  expect(style.overflow).toBeUndefined();
});

// The area starts where the bar ends: content cannot rest inside the bar, and
// a negative padding would only pull it under the area's top edge.
test("on Android TV content never starts above the area", async () => {
  jest.replaceProperty(Platform, "OS", "android");
  expect(
    (await renderHook(() => useTVBelowTabBarContentTop(40))).result.current,
  ).toBe(0);
});

test("content rests where it did, below the safe area, on both TVs", async () => {
  jest.replaceProperty(Platform, "OS", "android");
  expect(
    (await renderHook(() => useTVBelowTabBarContentTop(120))).result.current,
  ).toBe(120 - TV_TOP_TAB_BAR_CLEARANCE);

  jest.replaceProperty(Platform, "OS", "ios");
  expect(
    (await renderHook(() => useTVBelowTabBarContentTop(120))).result.current,
  ).toBe(20 + 120);
});
