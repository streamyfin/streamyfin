import React from "react";
import { Animated, Pressable, View } from "react-native";
import { Text } from "@/components/common/Text";
import { useTVFocusAnimation } from "@/components/tv/hooks/useTVFocusAnimation";
import { useScaledTVTypography } from "@/constants/TVTypography";

export interface TVServerIconProps {
  name: string;
  address: string;
  onPress: () => void;
  onLongPress?: () => void;
  hasTVPreferredFocus?: boolean;
  disabled?: boolean;
}

export const TVServerIcon = React.forwardRef<View, TVServerIconProps>(
  (
    {
      name,
      address,
      onPress,
      onLongPress,
      hasTVPreferredFocus,
      disabled = false,
    },
    ref,
  ) => {
    const typography = useScaledTVTypography();
    const { focused, handleFocus, handleBlur, animatedStyle } =
      useTVFocusAnimation();

    // Get the first letter of the server name (or address if no name)
    const displayName = name || address;
    const initial = displayName.charAt(0).toUpperCase();

    return (
      <Pressable
        ref={ref}
        onPress={onPress}
        onLongPress={onLongPress}
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
            <Text
              style={{
                fontSize: 48,
                fontWeight: "bold",
                color: focused ? "#fff" : "rgba(255,255,255,0.9)",
              }}
            >
              {initial}
            </Text>
          </View>

          <Text
            style={{
              fontSize: typography.body,
              fontWeight: "600",
              color: focused ? "#fff" : "rgba(255,255,255,0.9)",
              textAlign: "center",
              marginBottom: 4,
            }}
            numberOfLines={2}
          >
            {displayName}
          </Text>

          {name && (
            <Text
              style={{
                fontSize: typography.callout,
                color: focused
                  ? "rgba(255,255,255,0.8)"
                  : "rgba(255,255,255,0.5)",
                textAlign: "center",
              }}
              numberOfLines={1}
            >
              {address.replace(/^https?:\/\//, "")}
            </Text>
          )}
        </Animated.View>
      </Pressable>
    );
  },
);
