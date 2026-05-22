import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Animated, Pressable, View } from "react-native";
import { Text } from "@/components/common/Text";
import { useScaledTVTypography } from "@/constants/TVTypography";
import { scaleSize } from "@/utils/scaleSize";
import { useTVFocusAnimation } from "../hooks/useTVFocusAnimation";

export interface TVSettingsOptionButtonProps {
  label: string;
  value: string;
  onPress: () => void;
  isFirst?: boolean;
  disabled?: boolean;
}

export const TVSettingsOptionButton: React.FC<TVSettingsOptionButtonProps> = ({
  label,
  value,
  onPress,
  isFirst,
  disabled,
}) => {
  const typography = useScaledTVTypography();
  const { focused, handleFocus, handleBlur, animatedStyle } =
    useTVFocusAnimation({ scaleAmount: 1.02 });

  return (
    <Pressable
      onPress={onPress}
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
            opacity: disabled ? 0.4 : 1,
          },
        ]}
      >
        <Text style={{ fontSize: typography.body, color: "#FFFFFF" }}>
          {label}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text
            style={{
              fontSize: typography.callout,
              color: "#9CA3AF",
              marginRight: scaleSize(12),
            }}
          >
            {value}
          </Text>
          <Ionicons
            name='chevron-forward'
            size={scaleSize(20)}
            color='#6B7280'
          />
        </View>
      </Animated.View>
    </Pressable>
  );
};
