import React from "react";
import { Animated, Pressable, View } from "react-native";
import { Text } from "@/components/common/Text";
import { useScaledTVTypography } from "@/constants/TVTypography";
import { scaleSize } from "@/utils/scaleSize";
import { useTVFocusAnimation } from "../hooks/useTVFocusAnimation";

export interface TVSettingsToggleProps {
  label: string;
  value: boolean;
  onToggle: (value: boolean) => void;
  isFirst?: boolean;
  disabled?: boolean;
}

export const TVSettingsToggle: React.FC<TVSettingsToggleProps> = ({
  label,
  value,
  onToggle,
  isFirst,
  disabled,
}) => {
  const typography = useScaledTVTypography();
  const { focused, handleFocus, handleBlur, animatedStyle } =
    useTVFocusAnimation({ scaleAmount: 1.02 });

  return (
    <Pressable
      onPress={() => onToggle(!value)}
      onFocus={handleFocus}
      onBlur={handleBlur}
      hasTVPreferredFocus={isFirst && !disabled}
      disabled={disabled}
      focusable={!disabled}
    >
      <Animated.View
        style={[
          animatedStyle,
          {
            backgroundColor: focused
              ? "rgba(255, 255, 255, 0.15)"
              : "rgba(255, 255, 255, 0.05)",
            borderRadius: scaleSize(12),
            paddingVertical: scaleSize(16),
            paddingHorizontal: scaleSize(24),
            marginBottom: scaleSize(8),
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          },
        ]}
      >
        <Text style={{ fontSize: typography.body, color: "#FFFFFF" }}>
          {label}
        </Text>
        <View
          style={{
            width: scaleSize(56),
            height: scaleSize(32),
            borderRadius: scaleSize(16),
            backgroundColor: value ? "#FFFFFF" : "#4B5563",
            justifyContent: "center",
            paddingHorizontal: scaleSize(2),
          }}
        >
          <View
            style={{
              width: scaleSize(28),
              height: scaleSize(28),
              borderRadius: scaleSize(14),
              backgroundColor: value ? "#000000" : "#FFFFFF",
              alignSelf: value ? "flex-end" : "flex-start",
            }}
          />
        </View>
      </Animated.View>
    </Pressable>
  );
};
