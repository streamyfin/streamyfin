import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { Children, isValidElement } from "react";
import { Pressable, Text, View } from "react-native";
import type { SeerrSearchSort } from "@/components/seerr/SeerrIndexPage";
import { stubReactNative } from "@/test-utils/reactNative";

stubReactNative({ OS: "android" });

// The Compose views stand in as plain React Native ones: the menu lists its
// items only while expanded, and an item reports its click.
const MockPass = ({ children }: { children?: ReactNode }) => <>{children}</>;
const MockItems = ({ children }: { children?: ReactNode }) => <>{children}</>;
const MockDropdownMenu = (props: {
  expanded?: boolean;
  children?: ReactNode;
}) => (
  <View>
    {Children.map(props.children, (child) =>
      isValidElement(child) && child.type === MockItems && !props.expanded
        ? null
        : child,
    )}
  </View>
);
MockDropdownMenu.Trigger = MockPass;
MockDropdownMenu.Items = MockItems;
const MockDropdownMenuItem = (props: {
  onClick?: () => void;
  enabled?: boolean;
  children?: ReactNode;
}) => (
  <Pressable
    accessibilityRole='menuitem'
    disabled={props.enabled === false}
    onPress={props.onClick}
  >
    {props.children}
  </Pressable>
);
MockDropdownMenuItem.Text = MockPass;
MockDropdownMenuItem.LeadingIcon = MockPass;
MockDropdownMenuItem.TrailingIcon = MockPass;
const MockText = (props: { children?: ReactNode }) => (
  <Text>{props.children}</Text>
);
const MockRadioButton = (props: { selected: boolean }) => (
  <Text>{props.selected ? "selected" : "not selected"}</Text>
);
const mockNothing = () => null;
jest.mock("@expo/ui/jetpack-compose", () => ({
  Host: MockPass,
  RNHostView: MockPass,
  DropdownMenu: MockDropdownMenu,
  DropdownMenuItem: MockDropdownMenuItem,
  HorizontalDivider: mockNothing,
  Text: MockText,
  RadioButton: MockRadioButton,
}));
// The sort enum lives in the Seerr page, which would pull the whole page in.
jest.mock("@/components/seerr/SeerrIndexPage", () => ({
  SeerrSearchSort: {
    0: "DEFAULT",
    1: "VOTE_COUNT_AND_AVERAGE",
    2: "POPULARITY",
    DEFAULT: 0,
    VOTE_COUNT_AND_AVERAGE: 1,
    POPULARITY: 2,
  },
}));

const { DiscoverFilters } =
  require("@/components/search/DiscoverFilters") as typeof import("@/components/search/DiscoverFilters");

const setSeerrOrderBy = jest.fn();
const setSeerrSortOrder = jest.fn();

const renderFilters = () =>
  render(
    <DiscoverFilters
      seerrOrderBy={"DEFAULT" as unknown as SeerrSearchSort}
      setSeerrOrderBy={setSeerrOrderBy}
      seerrSortOrder='desc'
      setSeerrSortOrder={setSeerrSortOrder}
      t={(key: string) => key}
    />,
  );

const openMenu = () =>
  fireEvent.press(
    screen.getByRole("button", { name: "library.filters.sort_by" }),
  );

describe("DiscoverFilters on Android", () => {
  beforeEach(() => {
    setSeerrOrderBy.mockClear();
    setSeerrSortOrder.mockClear();
  });

  // As on iOS: one button, and the sort and the order in the menu it opens.
  test("shows one filter button that opens both choices", async () => {
    await renderFilters();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.queryByText("library.filters.sort_order")).toBeNull();

    await openMenu();
    expect(screen.getByText("library.filters.sort_by")).toBeTruthy();
    expect(screen.getByText("library.filters.sort_order")).toBeTruthy();
  });

  test("sorts by the choice picked and closes the menu", async () => {
    await renderFilters();
    await openMenu();
    await fireEvent.press(
      screen.getByText("home.settings.plugins.seerr.order_by.POPULARITY"),
    );

    expect(setSeerrOrderBy).toHaveBeenCalledWith("POPULARITY");
    expect(
      screen.queryByText("home.settings.plugins.seerr.order_by.POPULARITY"),
    ).toBeNull();
  });

  test("orders by the choice picked", async () => {
    await renderFilters();
    await openMenu();
    await fireEvent.press(screen.getByText("library.filters.asc"));

    expect(setSeerrSortOrder).toHaveBeenCalledWith("asc");
  });

  // The current sort and order show as picked, as their circles do on iOS.
  test("marks the current choices", async () => {
    await renderFilters();
    await openMenu();

    const marks = screen.getAllByText(/selected/).map((m) => m.props.children);
    // Three sorts then two orders: Default and Descending are the current ones.
    expect(marks).toEqual([
      "selected",
      "not selected",
      "not selected",
      "not selected",
      "selected",
    ]);
  });
});
