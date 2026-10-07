import type { screen as Screen } from "@testing-library/react-native";
import type React from "react";
import { View, type ViewProps } from "react-native";

/**
 * Stands for `@expo/ui/swift-ui` in specs. The SwiftUI views become plain
 * views, and each Menu keeps the modifiers it was given, so a spec can read
 * back what a menu was configured with. The modifiers themselves stay real:
 * `@expo/ui/swift-ui/modifiers` is plain JavaScript and loads under jest-expo.
 */
export const swiftUiModule = {
  Host: ({ children }: { children?: React.ReactNode }) => (
    <View>{children}</View>
  ),
  Menu: ({
    children,
    modifiers,
  }: {
    children?: React.ReactNode;
    modifiers?: unknown[];
  }) => (
    <View
      {...({ testID: "swiftui-menu", menuModifiers: modifiers } as ViewProps)}
    >
      {children}
    </View>
  ),
  Button: () => null,
};

/**
 * The modifiers of every Menu on screen, outermost first. Takes the spec's
 * `screen` so this module never loads the testing library itself: it is also
 * required from module mocks, where a second copy would register its hooks
 * inside a running test.
 */
export const renderedMenuModifiers = (queries: typeof Screen) =>
  queries
    .getAllByTestId("swiftui-menu")
    .map((menu) => menu.props.menuModifiers as unknown[] | undefined);
