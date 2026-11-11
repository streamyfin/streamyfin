import type { screen as Screen } from "@testing-library/react-native";
import React, { Children } from "react";
import { View as Box, Text as Row, type ViewProps } from "react-native";

export const swiftUiHostProps = jest.fn();
export const swiftUiPickerProps = jest.fn();

type Tagged = React.ReactElement<{
  modifiers: { tag: string }[];
  children: React.ReactNode;
}>;

const Stack = ({ children }: { children?: React.ReactNode }) => (
  <Box>{children}</Box>
);
const nothing = () => null;

/**
 * `@expo/ui/swift-ui` for every unit spec, wired in `unitSetup.ts`. The SwiftUI
 * views are native. Each stands in as what it carries: the Host records its
 * props, a Menu is its label and its items and keeps the modifiers it was
 * given, a Button is a row, a stack is its children. Views that only draw
 * native pixels (an image, a spinner, a spacer, a text) draw nothing. The
 * modifiers stay real: `@expo/ui/swift-ui/modifiers` is plain JavaScript and
 * loads under jest-expo.
 */
export const swiftUiModule = {
  Host: (props: { children: React.ReactNode }) => {
    swiftUiHostProps(props);
    return <Box>{props.children}</Box>;
  },
  Menu: ({
    label,
    children,
    modifiers,
  }: {
    label?: React.ReactNode;
    children?: React.ReactNode;
    modifiers?: unknown[];
  }) => (
    <Box
      {...({ testID: "swiftui-menu", menuModifiers: modifiers } as ViewProps)}
    >
      {typeof label === "string" ? <Row>{label}</Row> : label}
      {children}
    </Box>
  ),
  Button: ({ label, onPress }: { label?: string; onPress?: () => void }) => (
    <Row accessibilityRole='menuitem' onPress={onPress}>
      {label}
    </Row>
  ),
  // The system control is native. It stands in as what it is handed: a
  // selection, and one tagged label per segment that reports its tag when
  // pressed.
  Picker: (props: {
    selection: string;
    onSelectionChange: (tag: string) => void;
    children: React.ReactNode;
  }) => {
    swiftUiPickerProps(props);
    return (
      <Box accessibilityRole='tablist'>
        {Children.map(props.children as Tagged | readonly Tagged[], (child) => {
          const value = child.props.modifiers[0].tag;
          return (
            <Row
              accessibilityRole='tab'
              accessibilityState={{ selected: value === props.selection }}
              onPress={() => props.onSelectionChange(value)}
            >
              {child.props.children}
            </Row>
          );
        })}
      </Box>
    );
  },
  HStack: Stack,
  Spacer: nothing,
  Image: nothing,
  ProgressView: nothing,
  Text: nothing,
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
