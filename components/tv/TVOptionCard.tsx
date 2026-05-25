import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Animated, Pressable, View } from "react-native";
import { Text } from "@/components/common/Text";
import { useScaledTVTypography } from "@/constants/TVTypography";
import { scaleSize } from "@/utils/scaleSize";
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
    const typography = useScaledTVTypography();
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
                  ? "rgba(255,255,255,0.15)"
                  : "rgba(255,255,255,0.08)",
              borderRadius: scaleSize(14),
              borderWidth: focused ? 0 : selected ? scaleSize(2) : 0,
              borderColor: "rgba(255,255,255,0.6)",
              justifyContent: "center",
              alignItems: "center",
              paddingHorizontal: scaleSize(12),
            },
          ]}
        >
          <Text
            style={{
              fontSize: typography.callout,
              color: focused ? "#000" : "#fff",
              fontWeight: focused || selected ? "600" : "400",
              textAlign: "center",
            }}
            numberOfLines={4}
          >
            {label}
          </Text>
          {sublabel && (
            <Text
              style={{
                fontSize: typography.callout,
                color: focused ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.5)",
                textAlign: "center",
                marginTop: scaleSize(2),
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
