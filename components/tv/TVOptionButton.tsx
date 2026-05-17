import { BlurView } from "expo-blur";
import React from "react";
import { Animated, Pressable, View } from "react-native";
import { Text } from "@/components/common/Text";
import { useTVDesignTokens } from "@/constants/TVSizes";
import { useScaledTVTypography } from "@/constants/TVTypography";
import { useTVFocusAnimation } from "./hooks/useTVFocusAnimation";

export interface TVOptionButtonProps {
  label: string;
  value: string;
  onPress: () => void;
  hasTVPreferredFocus?: boolean;
  maxWidth?: number;
}

export const TVOptionButton = React.forwardRef<View, TVOptionButtonProps>(
  ({ label, value, onPress, hasTVPreferredFocus, maxWidth }, ref) => {
    const typography = useScaledTVTypography();
    const tv = useTVDesignTokens();
    const { focused, handleFocus, handleBlur, animatedStyle } =
      useTVFocusAnimation({ scaleAmount: 1.02, duration: 120 });

    return (
      <Pressable
        ref={ref}
        onPress={onPress}
        onFocus={handleFocus}
        onBlur={handleBlur}
        hasTVPreferredFocus={hasTVPreferredFocus}
      >
        <Animated.View
          style={[
            animatedStyle,
            {
              shadowColor: "#fff",
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: focused ? 0.4 : 0,
              shadowRadius: focused ? tv.shadow.md : 0,
            },
          ]}
        >
          {focused ? (
            <View
              style={{
                backgroundColor: "#fff",
                borderRadius: tv.radius.sm,
                paddingVertical: tv.spacing.xs,
                paddingHorizontal: tv.spacing.md,
                flexDirection: "row",
                alignItems: "center",
                gap: tv.spacing.xs,
                maxWidth,
              }}
            >
              <Text
                style={{
                  fontSize: typography.callout,
                  color: "#444",
                  flexShrink: 0,
                }}
              >
                {label}
              </Text>
              <Text
                style={{
                  fontSize: typography.callout,
                  color: "#000",
                  fontWeight: "500",
                  flexShrink: 1,
                }}
                numberOfLines={1}
              >
                {value}
              </Text>
            </View>
          ) : (
            <BlurView
              intensity={10}
              tint='light'
              style={{
                borderRadius: tv.radius.sm,
                overflow: "hidden",
                maxWidth,
              }}
            >
              <View
                style={{
                  backgroundColor: "rgba(0,0,0,0.3)",
                  paddingVertical: tv.spacing.xs,
                  paddingHorizontal: tv.spacing.md,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: tv.spacing.xs,
                }}
              >
                <Text
                  style={{
                    fontSize: typography.callout,
                    color: "#bbb",
                    flexShrink: 0,
                  }}
                >
                  {label}
                </Text>
                <Text
                  style={{
                    fontSize: typography.callout,
                    color: "#E5E7EB",
                    fontWeight: "500",
                    flexShrink: 1,
                  }}
                  numberOfLines={1}
                >
                  {value}
                </Text>
              </View>
            </BlurView>
          )}
        </Animated.View>
      </Pressable>
    );
  },
);
