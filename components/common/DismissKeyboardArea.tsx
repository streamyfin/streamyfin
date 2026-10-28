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
 * no return key, so a tap beside the field is how it goes away. Buttons and
 * fields inside keep their own presses; a disabled button takes none, so a tap
 * on one closes the keyboard too.
 */
export const DismissKeyboardArea: React.FC<DismissKeyboardAreaProps> = ({
  children,
  style,
}) => (
  <Pressable
    accessible={false}
    // Not a button on Android either: no click sound, no TalkBack focus.
    android_disableSound
    focusable={false}
    onPress={Keyboard.dismiss}
    style={style}
  >
    {children}
  </Pressable>
);
