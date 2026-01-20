import { Ionicons } from "@expo/vector-icons";
import type { FC } from "react";
import {
  Pressable,
  Animated as RNAnimated,
  StyleSheet,
  type View,
} from "react-native";
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
      focusable={!disabled}
      hasTVPreferredFocus={hasTVPreferredFocus && !disabled}
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
        <Ionicons name={icon} size={size} color='#fff' />
      </RNAnimated.View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  button: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
  },
});
