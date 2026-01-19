import React from "react";
import { Animated, Pressable, View } from "react-native";
import { Text } from "@/components/common/Text";
import { TVTypography } from "@/constants/TVTypography";
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
            borderRadius: 12,
            paddingVertical: 16,
            paddingHorizontal: 24,
            marginBottom: 8,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          },
        ]}
      >
        <Text style={{ fontSize: TVTypography.body, color: "#FFFFFF" }}>
          {label}
        </Text>
        <View
          style={{
            width: 56,
            height: 32,
            borderRadius: 16,
            backgroundColor: value ? "#34C759" : "#4B5563",
            justifyContent: "center",
            paddingHorizontal: 2,
          }}
        >
          <View
            style={{
              width: 28,
              height: 28,
              borderRadius: 14,
              backgroundColor: "#FFFFFF",
              alignSelf: value ? "flex-end" : "flex-start",
            }}
          />
        </View>
      </Animated.View>
    </Pressable>
  );
};
