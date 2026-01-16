import React, { useRef, useState } from "react";
import { Animated, Easing, Pressable, type ViewStyle } from "react-native";

interface TVFocusablePosterProps {
  children: React.ReactNode;
  onPress: () => void;
  hasTVPreferredFocus?: boolean;
  glowColor?: "white" | "purple";
  scaleAmount?: number;
  style?: ViewStyle;
  onFocus?: () => void;
  onBlur?: () => void;
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
      hasTVPreferredFocus={hasTVPreferredFocus}
    >
      <Animated.View
        style={[
          {
            transform: [{ scale }],
            shadowColor,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: focused ? 0.6 : 0,
            shadowRadius: focused ? 20 : 0,
          },
          style,
        ]}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
};
