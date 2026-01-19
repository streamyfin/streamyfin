import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Animated, Pressable } from "react-native";
import { Text } from "@/components/common/Text";
import { TVTypography } from "@/constants/TVTypography";
import { useTVFocusAnimation } from "./hooks/useTVFocusAnimation";

export interface TVCancelButtonProps {
  onPress: () => void;
  label?: string;
  disabled?: boolean;
}

export const TVCancelButton: React.FC<TVCancelButtonProps> = ({
  onPress,
  label = "Cancel",
  disabled = false,
}) => {
  const { focused, handleFocus, handleBlur, animatedStyle } =
    useTVFocusAnimation({ scaleAmount: 1.05, duration: 120 });

  return (
    <Pressable
      onPress={onPress}
      onFocus={handleFocus}
      onBlur={handleBlur}
      disabled={disabled}
      focusable={!disabled}
    >
      <Animated.View
        style={[
          animatedStyle,
          {
            backgroundColor: focused ? "#fff" : "rgba(255,255,255,0.15)",
            paddingHorizontal: 20,
            paddingVertical: 12,
            borderRadius: 10,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
          },
        ]}
      >
        <Ionicons
          name='close'
          size={20}
          color={focused ? "#000" : "rgba(255,255,255,0.8)"}
        />
        <Text
          style={{
            fontSize: TVTypography.callout,
            color: focused ? "#000" : "rgba(255,255,255,0.8)",
            fontWeight: "500",
          }}
        >
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
};
