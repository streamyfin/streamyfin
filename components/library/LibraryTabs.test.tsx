import { pickerStyle } from "@expo/ui/swift-ui/modifiers";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { stubReactNative } from "@/test-utils/reactNative";
import { swiftUiPickerProps } from "@/test-utils/swiftUi";
import { LibraryTabs } from "./LibraryTabs";

// iOS draws the system's segmented control, Android the app's own. Both are
// the same tabs to whoever uses them.
describe.each(["ios", "android"] as const)("LibraryTabs on %s", (OS) => {
  beforeEach(() => {
    stubReactNative({ OS });
  });

  test("draws the tabs it is given and marks the active one", async () => {
    await render(
      <LibraryTabs
        tabs={["items", "collections"]}
        activeTab='collections'
        onSelect={() => {}}
      />,
    );

    expect(
      screen.getByRole("tab", { name: "library.tabs.collections" }),
    ).toBeSelected();
    expect(
      screen.getByRole("tab", { name: "library.tabs.items" }),
    ).not.toBeSelected();
    expect(screen.queryByText("library.tabs.playlists")).toBeNull();
  });

  test("reports the tab that was pressed", async () => {
    const onSelect = jest.fn();
    await render(
      <LibraryTabs
        tabs={["items", "collections", "playlists"]}
        activeTab='items'
        onSelect={onSelect}
      />,
    );

    await fireEvent.press(screen.getByText("library.tabs.playlists"));

    expect(onSelect).toHaveBeenCalledWith("playlists");
  });
});

describe("LibraryTabs", () => {
  // The segmented style is what makes it the glass control of iOS 26: a
  // picker left on its default style would draw a menu instead.
  test("is the system's segmented control on iOS", async () => {
    stubReactNative({ OS: "ios" });
    await render(
      <LibraryTabs
        tabs={["items", "collections"]}
        activeTab='items'
        onSelect={() => {}}
      />,
    );

    expect(swiftUiPickerProps).toHaveBeenCalledWith(
      expect.objectContaining({
        selection: "items",
        modifiers: [pickerStyle("segmented")],
      }),
    );
  });

  test("leaves the native picker alone on Android", async () => {
    stubReactNative({ OS: "android" });
    await render(
      <LibraryTabs
        tabs={["items", "collections"]}
        activeTab='items'
        onSelect={() => {}}
      />,
    );

    expect(swiftUiPickerProps).not.toHaveBeenCalled();
  });
});
