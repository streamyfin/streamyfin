import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Animated, Pressable, View } from "react-native";
import { Text } from "@/components/common/Text";
import { useScaledTVTypography } from "@/constants/TVTypography";
import { useTVFocusAnimation } from "../hooks/useTVFocusAnimation";

export interface TVSettingsRowProps {
  label: string;
  value: string;
  onPress?: () => void;
  isFirst?: boolean;
  showChevron?: boolean;
  disabled?: boolean;
}

export const TVSettingsRow: React.FC<TVSettingsRowProps> = ({
  label,
  value,
  onPress,
  isFirst,
  showChevron = true,
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
        <Text style={{ fontSize: typography.body, color: "#FFFFFF" }}>
          {label}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text
            style={{
              fontSize: typography.callout,
              color: "#9CA3AF",
              marginRight: showChevron ? 12 : 0,
            }}
          >
            {value}
          </Text>
          {showChevron && (
            <Ionicons name='chevron-forward' size={20} color='#6B7280' />
          )}
        </View>
      </Animated.View>
    </Pressable>
  );
};
