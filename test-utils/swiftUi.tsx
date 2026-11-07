import React, { Children } from "react";
import { View as Box, Text as Row } from "react-native";

export const swiftUiHostProps = jest.fn();
export const swiftUiPickerProps = jest.fn();

type Tagged = React.ReactElement<{
  modifiers: { tag: string }[];
  children: React.ReactNode;
}>;

// The SwiftUI views are native. Each stands in as what it carries: the Host
// records its props, the Menu is its label and its items, a Button a row.
export const swiftUiModule = {
  Host: (props: { children: React.ReactNode }) => {
    swiftUiHostProps(props);
    return <Box>{props.children}</Box>;
  },
  Menu: ({
    label,
    children,
  }: {
    label: React.ReactNode;
    children: React.ReactNode;
  }) => (
    <Box>
      {label}
      {children}
    </Box>
  ),
  Button: ({ label, onPress }: { label: string; onPress: () => void }) => (
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
  Text: () => null,
};

export const swiftUiModifiersModule = {
  disabled: jest.fn(),
  pickerStyle: (style: string) => ({ pickerStyle: style }),
  tag: (value: string) => ({ tag: value }),
};
