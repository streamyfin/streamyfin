import { BlurView } from "expo-blur";
import React from "react";
import { Animated, Pressable, View } from "react-native";
import { Text } from "@/components/common/Text";
import { useScaledTVTypography } from "@/constants/TVTypography";
import { scaleSize } from "@/utils/scaleSize";
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
        <Animated.View style={[animatedStyle]}>
          {focused ? (
            <View
              style={{
                backgroundColor: "#fff",
                borderRadius: scaleSize(8),
                borderWidth: 0,
                paddingVertical: scaleSize(10),
                paddingHorizontal: scaleSize(16),
                flexDirection: "row",
                alignItems: "center",
                gap: scaleSize(8),
                maxWidth,
                // tvOS-only centered glow — on Android, elevation draws an
                // offset shadow outside the pill, so the focus signal there
                // is the white fill itself plus the scale animation.
                shadowColor: "#fff",
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.5,
                shadowRadius: scaleSize(12),
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
                borderRadius: scaleSize(8),
                overflow: "hidden",
                maxWidth,
              }}
            >
              <View
                style={{
                  backgroundColor: "rgba(0,0,0,0.3)",
                  paddingVertical: scaleSize(10),
                  paddingHorizontal: scaleSize(16),
                  flexDirection: "row",
                  alignItems: "center",
                  gap: scaleSize(8),
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
