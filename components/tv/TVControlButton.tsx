import { Ionicons } from "@expo/vector-icons";
import type { FC } from "react";
import {
  Pressable,
  Animated as RNAnimated,
  StyleSheet,
  type View,
} from "react-native";
import { scaleSize } from "@/utils/scaleSize";
import { useTVFocusAnimation } from "./hooks/useTVFocusAnimation";

export interface TVControlButtonProps {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  onLongPress?: () => void;
  onPressOut?: () => void;
  disabled?: boolean;
  hasTVPreferredFocus?: boolean;
  size?: number;
  delayLongPress?: number;
  /** Callback ref setter for focus guide destination pattern */
  refSetter?: (ref: View | null) => void;
  /**
   * Whether this button can receive TV focus. Defaults to true.
   * Set to false while the controls are hidden so the native TV focus
   * engine can't strand focus on an invisible (opacity 0) button.
   */
  focusable?: boolean;
}

export const TVControlButton: FC<TVControlButtonProps> = ({
  icon,
  onPress,
  onLongPress,
  onPressOut,
  disabled,
  hasTVPreferredFocus,
  size = 32,
  delayLongPress = 300,
  refSetter,
  focusable = true,
}) => {
  const { focused, handleFocus, handleBlur, animatedStyle } =
    useTVFocusAnimation({ scaleAmount: 1.15, duration: 120 });

  return (
    <Pressable
      ref={refSetter}
      onPress={onPress}
      onLongPress={onLongPress}
      onPressOut={onPressOut}
      delayLongPress={delayLongPress}
      onFocus={handleFocus}
      onBlur={handleBlur}
      disabled={disabled}
      focusable={focusable && !disabled}
      hasTVPreferredFocus={hasTVPreferredFocus && !disabled && focusable}
    >
      <RNAnimated.View
        style={[
          styles.button,
          animatedStyle,
          {
            backgroundColor: focused
              ? "rgba(255,255,255,0.3)"
              : "rgba(255,255,255,0.1)",
            borderColor: focused
              ? "rgba(255,255,255,0.8)"
              : "rgba(255,255,255,0.2)",
            opacity: disabled ? 0.3 : 1,
          },
        ]}
      >
        <Ionicons name={icon} size={scaleSize(size)} color='#fff' />
      </RNAnimated.View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  button: {
    width: scaleSize(64),
    height: scaleSize(64),
    borderRadius: scaleSize(32),
    borderWidth: scaleSize(2),
    justifyContent: "center",
    alignItems: "center",
  },
});
