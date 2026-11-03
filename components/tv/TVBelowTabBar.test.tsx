import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { TV_TOP_TAB_BAR_CLEARANCE } from "@/constants/Values";
import { TVBelowTabBar } from "./TVBelowTabBar";

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 20, bottom: 0, left: 0, right: 0 }),
}));

// The TV settings scrolled their text under the top tab bar, which has no
// background, and it read through the tab labels (seen on an Android TV,
// 2026-11-03).
test("starts below the tab bar and cuts off what scrolls above it", async () => {
  await render(
    <TVBelowTabBar>
      <Text>Settings</Text>
    </TVBelowTabBar>,
  );

  const area = screen.getByTestId("tv-below-tab-bar");
  expect(area.props.style).toMatchObject({
    marginTop: 20 + TV_TOP_TAB_BAR_CLEARANCE,
    overflow: "hidden",
  });
  expect(screen.getByText("Settings")).toBeTruthy();
});
