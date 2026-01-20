import React from "react";
import { Animated, Pressable, View, type ViewStyle } from "react-native";
import { useTVFocusAnimation } from "./hooks/useTVFocusAnimation";

export interface TVButtonProps {
  onPress: () => void;
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "glass";
  hasTVPreferredFocus?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  scaleAmount?: number;
  square?: boolean;
  refSetter?: (ref: View | null) => void;
  nextFocusDown?: number;
  nextFocusUp?: number;
}

const getButtonStyles = (
  variant: "primary" | "secondary" | "glass",
  focused: boolean,
) => {
  switch (variant) {
    case "glass":
      return {
        backgroundColor: focused
          ? "rgba(255, 255, 255, 0.25)"
          : "rgba(255, 255, 255, 0.1)",
        shadowColor: "#fff",
        borderWidth: 1,
        borderColor: focused
          ? "rgba(255, 255, 255, 0.4)"
          : "rgba(255, 255, 255, 0.15)",
      };
    case "secondary":
      return {
        backgroundColor: focused
          ? "rgba(255, 255, 255, 0.3)"
          : "rgba(255, 255, 255, 0.15)",
        shadowColor: "#fff",
        borderWidth: 2,
        borderColor: focused ? "#fff" : "rgba(255, 255, 255, 0.2)",
      };
    default:
      return {
        backgroundColor: focused ? "#ffffff" : "rgba(255, 255, 255, 0.9)",
        shadowColor: "#fff",
        borderWidth: 1,
        borderColor: "transparent",
      };
  }
};

export const TVButton: React.FC<TVButtonProps> = ({
  onPress,
  children,
  variant = "primary",
  hasTVPreferredFocus = false,
  disabled = false,
  style,
  scaleAmount = 1.05,
  square = false,
  refSetter,
  nextFocusDown,
  nextFocusUp,
}) => {
  const { focused, handleFocus, handleBlur, animatedStyle } =
    useTVFocusAnimation({ scaleAmount });

  const buttonStyles = getButtonStyles(variant, focused);

  return (
    <Pressable
      ref={refSetter}
      onPress={onPress}
      onFocus={handleFocus}
      onBlur={handleBlur}
      hasTVPreferredFocus={hasTVPreferredFocus && !disabled}
      disabled={disabled}
      focusable={!disabled}
      nextFocusDown={nextFocusDown}
      nextFocusUp={nextFocusUp}
    >
      <Animated.View
        style={[
          animatedStyle,
          {
            shadowColor: buttonStyles.shadowColor,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: focused ? 0.4 : 0,
            shadowRadius: focused ? 15 : 0,
          },
          style,
        ]}
      >
        <View
          style={{
            backgroundColor: buttonStyles.backgroundColor,
            borderWidth: buttonStyles.borderWidth,
            borderColor: buttonStyles.borderColor,
            borderRadius: 12,
            paddingVertical: 18,
            paddingHorizontal: square ? 18 : 32,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            minWidth: square ? undefined : 180,
          }}
        >
          {children}
        </View>
      </Animated.View>
    </Pressable>
  );
};
