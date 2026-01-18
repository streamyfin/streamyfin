import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Animated, Pressable, View } from "react-native";
import { Text } from "@/components/common/Text";
import { useTVFocusAnimation } from "./hooks/useTVFocusAnimation";

export interface TVOptionCardProps {
  label: string;
  sublabel?: string;
  selected: boolean;
  hasTVPreferredFocus?: boolean;
  onPress: () => void;
  width?: number;
  height?: number;
}

export const TVOptionCard = React.forwardRef<View, TVOptionCardProps>(
  (
    {
      label,
      sublabel,
      selected,
      hasTVPreferredFocus = false,
      onPress,
      width = 160,
      height = 75,
    },
    ref,
  ) => {
    const { focused, handleFocus, handleBlur, animatedStyle } =
      useTVFocusAnimation({ scaleAmount: 1.05 });

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
              width,
              height,
              backgroundColor: focused
                ? "#fff"
                : selected
                  ? "rgba(255,255,255,0.2)"
                  : "rgba(255,255,255,0.08)",
              borderRadius: 14,
              justifyContent: "center",
              alignItems: "center",
              paddingHorizontal: 12,
            },
          ]}
        >
          <Text
            style={{
              fontSize: 16,
              color: focused ? "#000" : "#fff",
              fontWeight: focused || selected ? "600" : "400",
              textAlign: "center",
            }}
            numberOfLines={2}
          >
            {label}
          </Text>
          {sublabel && (
            <Text
              style={{
                fontSize: 12,
                color: focused ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.5)",
                textAlign: "center",
                marginTop: 2,
              }}
              numberOfLines={1}
            >
              {sublabel}
            </Text>
          )}
          {selected && !focused && (
            <View
              style={{
                position: "absolute",
                top: 8,
                right: 8,
              }}
            >
              <Ionicons
                name='checkmark'
                size={16}
                color='rgba(255,255,255,0.8)'
              />
            </View>
          )}
        </Animated.View>
      </Pressable>
    );
  },
);
