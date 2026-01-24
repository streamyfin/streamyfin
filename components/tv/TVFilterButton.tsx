import React from "react";
import { Animated, Pressable, View } from "react-native";
import { Text } from "@/components/common/Text";
import { TVTypography } from "@/constants/TVTypography";
import { useTVFocusAnimation } from "./hooks/useTVFocusAnimation";

export interface TVFilterButtonProps {
  label: string;
  value: string;
  onPress: () => void;
  hasTVPreferredFocus?: boolean;
  disabled?: boolean;
  hasActiveFilter?: boolean;
}

export const TVFilterButton: React.FC<TVFilterButtonProps> = ({
  label,
  value,
  onPress,
  hasTVPreferredFocus = false,
  disabled = false,
  hasActiveFilter = false,
}) => {
  const { focused, handleFocus, handleBlur, animatedStyle } =
    useTVFocusAnimation({ scaleAmount: 1.04, duration: 120 });

  return (
    <Pressable
      onPress={onPress}
      onFocus={handleFocus}
      onBlur={handleBlur}
      hasTVPreferredFocus={hasTVPreferredFocus && !disabled}
      disabled={disabled}
      focusable={!disabled}
    >
      <Animated.View style={animatedStyle}>
        <View
          style={{
            backgroundColor: focused
              ? "#fff"
              : hasActiveFilter
                ? "rgba(255, 255, 255, 0.25)"
                : "rgba(255,255,255,0.1)",
            borderRadius: 10,
            paddingVertical: 10,
            paddingHorizontal: 16,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            borderWidth: hasActiveFilter && !focused ? 1 : 0,
            borderColor: "rgba(255, 255, 255, 0.4)",
          }}
        >
          {label ? (
            <Text
              style={{
                fontSize: TVTypography.callout,
                color: focused ? "#444" : "#bbb",
              }}
            >
              {label}
            </Text>
          ) : null}
          <Text
            style={{
              fontSize: TVTypography.callout,
              color: focused ? "#000" : "#FFFFFF",
              fontWeight: "500",
            }}
            numberOfLines={1}
          >
            {value}
          </Text>
        </View>
      </Animated.View>
    </Pressable>
  );
};
