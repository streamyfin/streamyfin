import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Animated, Pressable, View } from "react-native";
import { Text } from "@/components/common/Text";
import { useTVFocusAnimation } from "@/components/tv/hooks/useTVFocusAnimation";
import { useScaledTVTypography } from "@/constants/TVTypography";
import { scaleSize } from "@/utils/scaleSize";

export interface TVAddIconProps {
  label: string;
  onPress: () => void;
  hasTVPreferredFocus?: boolean;
  disabled?: boolean;
}

export const TVAddIcon = React.forwardRef<View, TVAddIconProps>(
  ({ label, onPress, hasTVPreferredFocus, disabled = false }, ref) => {
    const typography = useScaledTVTypography();
    const { focused, handleFocus, handleBlur, animatedStyle } =
      useTVFocusAnimation();

    return (
      <Pressable
        ref={ref}
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
              alignItems: "center",
              width: scaleSize(160),
              shadowColor: "#fff",
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: focused ? 0.5 : 0,
              shadowRadius: focused ? scaleSize(16) : 0,
            },
          ]}
        >
          <View
            style={{
              width: scaleSize(140),
              height: scaleSize(140),
              borderRadius: scaleSize(70),
              backgroundColor: focused
                ? "rgba(255,255,255,0.15)"
                : "rgba(255,255,255,0.05)",
              marginBottom: scaleSize(14),
              borderWidth: scaleSize(2),
              borderColor: focused ? "#fff" : "rgba(255,255,255,0.3)",
              borderStyle: "dashed",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Ionicons
              name='add'
              size={scaleSize(56)}
              color={focused ? "#fff" : "rgba(255,255,255,0.5)"}
            />
          </View>

          <Text
            style={{
              fontSize: typography.body,
              fontWeight: "600",
              color: focused ? "#fff" : "rgba(255,255,255,0.7)",
              textAlign: "center",
            }}
            numberOfLines={2}
          >
            {label}
          </Text>
        </Animated.View>
      </Pressable>
    );
  },
);
