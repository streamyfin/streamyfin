import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Animated, Pressable, View } from "react-native";
import { Text } from "@/components/common/Text";
import { useTVFocusAnimation } from "@/components/tv/hooks/useTVFocusAnimation";
import { useScaledTVTypography } from "@/constants/TVTypography";
import type { AccountSecurityType } from "@/utils/secureCredentials";

export interface TVUserIconProps {
  username: string;
  securityType: AccountSecurityType;
  onPress: () => void;
  hasTVPreferredFocus?: boolean;
  disabled?: boolean;
}

export const TVUserIcon = React.forwardRef<View, TVUserIconProps>(
  (
    { username, securityType, onPress, hasTVPreferredFocus, disabled = false },
    ref,
  ) => {
    const typography = useScaledTVTypography();
    const { focused, handleFocus, handleBlur, animatedStyle } =
      useTVFocusAnimation();

    const getSecurityIcon = (): keyof typeof Ionicons.glyphMap => {
      switch (securityType) {
        case "pin":
          return "keypad";
        case "password":
          return "lock-closed";
        default:
          return "key";
      }
    };

    const hasSecurityProtection = securityType !== "none";

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
              width: 160,
              shadowColor: "#fff",
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: focused ? 0.5 : 0,
              shadowRadius: focused ? 16 : 0,
            },
          ]}
        >
          <View style={{ position: "relative" }}>
            <View
              style={{
                width: 140,
                height: 140,
                borderRadius: 70,
                overflow: "hidden",
                backgroundColor: focused
                  ? "rgba(255,255,255,0.2)"
                  : "rgba(255,255,255,0.1)",
                marginBottom: 14,
                borderWidth: focused ? 3 : 0,
                borderColor: "#fff",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Ionicons
                name='person'
                size={56}
                color={
                  focused ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.4)"
                }
              />
            </View>

            {/* Security badge */}
            {hasSecurityProtection && (
              <View
                style={{
                  position: "absolute",
                  bottom: 10,
                  right: 10,
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: focused ? "#fff" : "rgba(255,255,255,0.9)",
                  justifyContent: "center",
                  alignItems: "center",
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.3,
                  shadowRadius: 4,
                }}
              >
                <Ionicons name={getSecurityIcon()} size={16} color='#000' />
              </View>
            )}
          </View>

          <Text
            style={{
              fontSize: typography.body,
              fontWeight: "600",
              color: focused ? "#fff" : "rgba(255,255,255,0.9)",
              textAlign: "center",
            }}
            numberOfLines={2}
          >
            {username}
          </Text>
        </Animated.View>
      </Pressable>
    );
  },
);
