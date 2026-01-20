import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Animated, Pressable, View } from "react-native";
import { Text } from "@/components/common/Text";
import { useTVFocusAnimation } from "@/components/tv/hooks/useTVFocusAnimation";
import { TVTypography } from "@/constants/TVTypography";

interface TVRequestOptionRowProps {
  label: string;
  value: string;
  onPress: () => void;
  hasTVPreferredFocus?: boolean;
  disabled?: boolean;
}

export const TVRequestOptionRow: React.FC<TVRequestOptionRowProps> = ({
  label,
  value,
  onPress,
  hasTVPreferredFocus = false,
  disabled = false,
}) => {
  const { focused, handleFocus, handleBlur, animatedStyle } =
    useTVFocusAnimation({
      scaleAmount: 1.02,
    });

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
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            paddingVertical: 14,
            paddingHorizontal: 16,
            backgroundColor: focused
              ? "rgba(255,255,255,0.15)"
              : "rgba(255,255,255,0.05)",
            borderRadius: 10,
            borderWidth: 1,
            borderColor: focused
              ? "rgba(255,255,255,0.3)"
              : "rgba(255,255,255,0.1)",
          },
        ]}
      >
        <Text
          style={{
            fontSize: TVTypography.callout,
            color: "rgba(255,255,255,0.6)",
          }}
        >
          {label}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text
            style={{
              fontSize: TVTypography.body,
              color: focused ? "#FFFFFF" : "rgba(255,255,255,0.9)",
              fontWeight: "500",
            }}
            numberOfLines={1}
          >
            {value}
          </Text>
          <Ionicons
            name='chevron-forward'
            size={18}
            color={focused ? "#FFFFFF" : "rgba(255,255,255,0.5)"}
          />
        </View>
      </Animated.View>
    </Pressable>
  );
};
