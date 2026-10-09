import { fireEvent, render, screen } from "@testing-library/react-native";
import type React from "react";
import { stubReactNative } from "@/test-utils/reactNative";
import { LibraryTabs } from "./LibraryTabs";

const mockPicker = jest.fn();

// The system control is native. It stands in as what it is handed: a
// selection, and one tagged label per segment that reports its tag when
// pressed.
jest.mock("@expo/ui/swift-ui", () => {
  const { Children } = jest.requireActual("react");
  const { Text: Segment, View: Box } = jest.requireActual("react-native");
  type MockTagged = React.ReactElement<{
    modifiers: { tag: string }[];
    children: React.ReactNode;
  }>;
  return {
    Host: ({ children }: { children: React.ReactNode }) => (
      <Box>{children}</Box>
    ),
    Picker: (props: {
      selection: string;
      onSelectionChange: (tag: string) => void;
      children: React.ReactNode;
    }) => {
      mockPicker(props);
      return (
        <Box accessibilityRole='tablist'>
          {Children.map(props.children, (child: MockTagged) => {
            const value = child.props.modifiers[0].tag;
            return (
              <Segment
                accessibilityRole='tab'
                accessibilityState={{ selected: value === props.selection }}
                onPress={() => props.onSelectionChange(value)}
              >
                {child.props.children}
              </Segment>
            );
          })}
        </Box>
      );
    },
    Text: () => null,
  };
});
jest.mock("@expo/ui/swift-ui/modifiers", () => ({
  pickerStyle: (style: string) => ({ pickerStyle: style }),
  tag: (value: string) => ({ tag: value }),
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// iOS draws the system's segmented control, Android the app's own. Both are
// the same tabs to whoever uses them.
describe.each(["ios", "android"] as const)("LibraryTabs on %s", (OS) => {
  beforeEach(() => {
    jest.clearAllMocks();
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
  beforeEach(() => jest.clearAllMocks());

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

    expect(mockPicker).toHaveBeenCalledWith(
      expect.objectContaining({
        selection: "items",
        modifiers: [{ pickerStyle: "segmented" }],
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

    expect(mockPicker).not.toHaveBeenCalled();
  });
});
