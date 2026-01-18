import React from "react";
import { Animated, Pressable, View } from "react-native";
import { Text } from "@/components/common/Text";
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
          <View
            style={{
              backgroundColor: focused ? "#fff" : "rgba(255,255,255,0.1)",
              borderRadius: 10,
              paddingVertical: 10,
              paddingHorizontal: 16,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Text
              style={{
                fontSize: 14,
                color: focused ? "#444" : "#bbb",
              }}
            >
              {label}
            </Text>
            <Text
              style={{
                fontSize: 14,
                color: focused ? "#000" : "#FFFFFF",
                fontWeight: "500",
              }}
              numberOfLines={1}
            >
              {value}
            </Text>
          </View>
        </Animated.View>
      </Pressable>
    );
  },
);
