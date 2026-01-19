import { BlurView } from "expo-blur";
import React from "react";
import { Animated, Pressable, View } from "react-native";
import { Text } from "@/components/common/Text";
import { TVTypography } from "@/constants/TVTypography";
import { useTVFocusAnimation } from "./hooks/useTVFocusAnimation";

export interface TVOptionButtonProps {
  label: string;
  value: string;
  onPress: () => void;
  hasTVPreferredFocus?: boolean;
}

export const TVOptionButton = React.forwardRef<View, TVOptionButtonProps>(
  ({ label, value, onPress, hasTVPreferredFocus }, ref) => {
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
              shadowRadius: focused ? 12 : 0,
            },
          ]}
        >
          {focused ? (
            <View
              style={{
                backgroundColor: "#fff",
                borderRadius: 8,
                paddingVertical: 10,
                paddingHorizontal: 16,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Text
                style={{
                  fontSize: TVTypography.callout,
                  color: "#444",
                }}
              >
                {label}
              </Text>
              <Text
                style={{
                  fontSize: TVTypography.callout,
                  color: "#000",
                  fontWeight: "500",
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
                borderRadius: 8,
                overflow: "hidden",
              }}
            >
              <View
                style={{
                  backgroundColor: "rgba(0,0,0,0.3)",
                  paddingVertical: 10,
                  paddingHorizontal: 16,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <Text
                  style={{
                    fontSize: TVTypography.callout,
                    color: "#bbb",
                  }}
                >
                  {label}
                </Text>
                <Text
                  style={{
                    fontSize: TVTypography.callout,
                    color: "#E5E7EB",
                    fontWeight: "500",
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
