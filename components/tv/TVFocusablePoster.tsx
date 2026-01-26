import React, { useRef, useState } from "react";
import {
  Animated,
  Easing,
  Pressable,
  View,
  type ViewStyle,
} from "react-native";

export interface TVFocusablePosterProps {
  children: React.ReactNode;
  onPress: () => void;
  hasTVPreferredFocus?: boolean;
  glowColor?: "white" | "purple";
  scaleAmount?: number;
  style?: ViewStyle;
  onFocus?: () => void;
  onBlur?: () => void;
  disabled?: boolean;
  /** When true, the item remains focusable even when disabled (for navigation purposes) */
  focusableWhenDisabled?: boolean;
  /** Setter function for the ref (for focus guide destinations) */
  refSetter?: (ref: View | null) => void;
}

export const TVFocusablePoster: React.FC<TVFocusablePosterProps> = ({
  children,
  onPress,
  hasTVPreferredFocus = false,
  glowColor = "white",
  scaleAmount = 1.05,
  style,
  onFocus: onFocusProp,
  onBlur: onBlurProp,
  disabled = false,
  focusableWhenDisabled = false,
  refSetter,
}) => {
  const [focused, setFocused] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = (value: number) =>
    Animated.timing(scale, {
      toValue: value,
      duration: 150,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();

  const shadowColor = glowColor === "white" ? "#ffffff" : "#a855f7";

  return (
    <Pressable
      ref={refSetter}
      onPress={onPress}
      onFocus={() => {
        setFocused(true);
        animateTo(scaleAmount);
        onFocusProp?.();
      }}
      onBlur={() => {
        setFocused(false);
        animateTo(1);
        onBlurProp?.();
      }}
      hasTVPreferredFocus={hasTVPreferredFocus && !disabled}
      disabled={disabled}
      focusable={!disabled || focusableWhenDisabled}
    >
      <Animated.View
        style={[
          {
            transform: [{ scale }],
            shadowColor,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: focused ? 0.3 : 0,
            shadowRadius: focused ? 12 : 0,
          },
          style,
        ]}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
};
