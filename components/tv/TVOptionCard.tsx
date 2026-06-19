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
          {/* Selected + unfocused: label and checkmark form a centered group.
              The left padding offsets the checkmark's width so the label stays
              optically centered. Without a checkmark, no offset → label centered. */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              // Offset checkmark width only when it's shown, else label sits right.
              paddingLeft: selected && !focused ? scaleSize(10) : 0,
            }}
          >
            <Text
              style={{
                fontSize: typography.callout,
                color: focused ? "#000" : "#fff",
                fontWeight: focused || selected ? "600" : "400",
                textAlign: "center",
                flexShrink: 1,
              }}
              numberOfLines={4}
            >
              {label}
            </Text>
            {selected && !focused && (
              <Ionicons
                name='checkmark'
                size={scaleSize(26)}
                color='rgba(255,255,255,0.8)'
                style={{ marginLeft: scaleSize(8), flexShrink: 0 }}
              />
            )}
          </View>
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
        </Animated.View>
      </Pressable>
    );
  },
);
