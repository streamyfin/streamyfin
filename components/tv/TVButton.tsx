import React from "react";
import { Animated, Pressable, View, type ViewStyle } from "react-native";
import { useTVFocusAnimation } from "./hooks/useTVFocusAnimation";

export interface TVButtonProps {
  onPress: () => void;
  children: React.ReactNode;
  variant?: "primary" | "secondary";
  hasTVPreferredFocus?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  scaleAmount?: number;
}

export const TVButton: React.FC<TVButtonProps> = ({
  onPress,
  children,
  variant = "primary",
  hasTVPreferredFocus = false,
  disabled = false,
  style,
  scaleAmount = 1.05,
}) => {
  const { focused, handleFocus, handleBlur, animatedStyle } =
    useTVFocusAnimation({ scaleAmount });

  const isPrimary = variant === "primary";

  return (
    <Pressable
      onPress={onPress}
      onFocus={handleFocus}
      onBlur={handleBlur}
      hasTVPreferredFocus={hasTVPreferredFocus && !disabled}
      disabled={disabled}
      focusable={!disabled}
    >
      <Animated.View
        style={[
          animatedStyle,
          {
            shadowColor: isPrimary ? "#fff" : "#a855f7",
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: focused ? 0.6 : 0,
            shadowRadius: focused ? 20 : 0,
          },
          style,
        ]}
      >
        <View
          style={{
            backgroundColor: focused
              ? isPrimary
                ? "#ffffff"
                : "#7c3aed"
              : isPrimary
                ? "rgba(255, 255, 255, 0.9)"
                : "rgba(124, 58, 237, 0.8)",
            borderRadius: 12,
            paddingVertical: 18,
            paddingHorizontal: 32,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            minWidth: 180,
          }}
        >
          {children}
        </View>
      </Animated.View>
    </Pressable>
  );
};
