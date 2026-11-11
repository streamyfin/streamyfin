import type { ReactNode } from "react";
import { Children, isValidElement } from "react";
import { Pressable, Text, View } from "react-native";

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
export const jetpackComposeModule = {
  Host: MockPass,
  RNHostView: MockPass,
  DropdownMenu: MockDropdownMenu,
  DropdownMenuItem: MockDropdownMenuItem,
  HorizontalDivider: mockNothing,
  Text: MockText,
  RadioButton: MockRadioButton,
};
