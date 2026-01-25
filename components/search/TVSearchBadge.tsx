import React from "react";
import { Animated, Pressable } from "react-native";
import { Text } from "@/components/common/Text";
import { useTVFocusAnimation } from "@/components/tv/hooks/useTVFocusAnimation";
import { useScaledTVTypography } from "@/constants/TVTypography";

export interface TVSearchBadgeProps {
  label: string;
  onPress: () => void;
  hasTVPreferredFocus?: boolean;
}

export const TVSearchBadge: React.FC<TVSearchBadgeProps> = ({
  label,
  onPress,
  hasTVPreferredFocus = false,
}) => {
  const typography = useScaledTVTypography();
  const { focused, handleFocus, handleBlur, animatedStyle } =
    useTVFocusAnimation({ scaleAmount: 1.08, duration: 150 });

  return (
    <Pressable
      onPress={onPress}
      onFocus={handleFocus}
      onBlur={handleBlur}
      hasTVPreferredFocus={hasTVPreferredFocus}
    >
      <Animated.View
        style={[
          animatedStyle,
          {
            paddingHorizontal: 24,
            paddingVertical: 14,
            borderRadius: 24,
            backgroundColor: focused ? "#fff" : "rgba(255,255,255,0.1)",
            shadowColor: "#fff",
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: focused ? 0.4 : 0,
            shadowRadius: focused ? 12 : 0,
          },
        ]}
      >
        <Text
          style={{
            fontSize: typography.callout,
            color: focused ? "#000" : "#fff",
            fontWeight: focused ? "600" : "400",
          }}
        >
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
};
