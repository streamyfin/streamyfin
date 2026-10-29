import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { Children, isValidElement } from "react";
import { Pressable, Text, View } from "react-native";
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
const { SearchSortMenu } =
  require("@/components/search/SearchSortMenu") as typeof import("@/components/search/SearchSortMenu");

const onSort = jest.fn();
const onOrder = jest.fn();
const sorts = [
  { value: "DEFAULT", label: "Default" },
  { value: "VOTE_COUNT_AND_AVERAGE", label: "Vote count and average" },
  { value: "POPULARITY", label: "Popularity" },
];

const renderMenu = (
  { order }: { order?: "asc" | "desc" } = { order: "desc" },
) =>
  render(
    <SearchSortMenu
      sorts={sorts}
      sort='DEFAULT'
      onSort={onSort}
      order={order}
      onOrder={onOrder}
      t={(key: string) => key}
    />,
  );

const openMenu = () =>
  fireEvent.press(
    screen.getByRole("button", { name: "library.filters.sort_by" }),
  );

describe("SearchSortMenu on Android", () => {
  beforeEach(() => {
    onSort.mockClear();
    onOrder.mockClear();
  });

  // As on iOS: one button, and the sort and the order in the menu it opens.
  test("shows one filter button that opens both choices", async () => {
    await renderMenu();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.queryByText("library.filters.sort_order")).toBeNull();

    await openMenu();
    expect(screen.getByText("library.filters.sort_by")).toBeTruthy();
    expect(screen.getByText("library.filters.sort_order")).toBeTruthy();
  });

  test("sorts by the choice picked and closes the menu", async () => {
    await renderMenu();
    await openMenu();
    await fireEvent.press(screen.getByText("Popularity"));

    expect(onSort).toHaveBeenCalledWith("POPULARITY");
    expect(screen.queryByText("Popularity")).toBeNull();
  });

  test("orders by the choice picked", async () => {
    await renderMenu();
    await openMenu();
    await fireEvent.press(screen.getByText("library.filters.asc"));

    expect(onOrder).toHaveBeenCalledWith("asc");
  });

  // The current sort and order show as picked, as their circles do on iOS.
  test("marks the current choices", async () => {
    await renderMenu();
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

  // Relevance, the Library search's own order, has no direction to pick.
  test("leaves the order out for a sort that has none", async () => {
    await renderMenu({});
    await openMenu();

    expect(screen.getByText("library.filters.sort_by")).toBeTruthy();
    expect(screen.queryByText("library.filters.sort_order")).toBeNull();
    expect(screen.queryByText("library.filters.asc")).toBeNull();
  });
});
