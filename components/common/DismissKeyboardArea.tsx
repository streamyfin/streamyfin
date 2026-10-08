import type React from "react";
import {
  Keyboard,
  Pressable,
  type StyleProp,
  type ViewStyle,
} from "react-native";

interface DismissKeyboardAreaProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * Closes the keyboard on a tap on an empty part of its area. A number pad has
 * no return key, so a tap beside the field is how it goes away; buttons and
 * fields inside keep their own presses.
 */
export const DismissKeyboardArea: React.FC<DismissKeyboardAreaProps> = ({
  children,
  style,
}) => (
  <Pressable accessible={false} onPress={Keyboard.dismiss} style={style}>
    {children}
  </Pressable>
);
