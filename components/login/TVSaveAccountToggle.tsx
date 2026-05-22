import React, { useRef, useState } from "react";
import { Animated, Easing, Pressable, View } from "react-native";
import { Text } from "@/components/common/Text";
import { scaleSize } from "@/utils/scaleSize";

interface TVSaveAccountToggleProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  label: string;
  hasTVPreferredFocus?: boolean;
  disabled?: boolean;
}

export const TVSaveAccountToggle: React.FC<TVSaveAccountToggleProps> = ({
  value,
  onValueChange,
  label,
  hasTVPreferredFocus,
  disabled = false,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;

  const animateFocus = (focused: boolean) => {
    Animated.parallel([
      Animated.timing(scale, {
        toValue: focused ? 1.02 : 1,
        duration: 150,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(glowOpacity, {
        toValue: focused ? 0.6 : 0,
        duration: 150,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleFocus = () => {
    setIsFocused(true);
    animateFocus(true);
  };

  const handleBlur = () => {
    setIsFocused(false);
    animateFocus(false);
  };

  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      onFocus={handleFocus}
      onBlur={handleBlur}
      hasTVPreferredFocus={hasTVPreferredFocus && !disabled}
      disabled={disabled}
      focusable={!disabled}
    >
      <Animated.View
        style={[
          {
            transform: [{ scale }],
            shadowColor: "#fff",
            shadowOffset: { width: 0, height: 0 },
            shadowRadius: 16,
            elevation: 8,
          },
          { shadowOpacity: glowOpacity },
        ]}
      >
        <View
          style={{
            backgroundColor: isFocused ? "#2a2a2a" : "#1a1a1a",
            borderWidth: 2,
            borderColor: isFocused ? "#FFFFFF" : "transparent",
            borderRadius: scaleSize(16),
            paddingHorizontal: scaleSize(24),
            paddingVertical: scaleSize(20),
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text
            style={{
              fontSize: scaleSize(20),
              color: "#FFFFFF",
            }}
          >
            {label}
          </Text>
          <View
            pointerEvents='none'
            style={{
              width: scaleSize(60),
              height: scaleSize(34),
              borderRadius: scaleSize(17),
              backgroundColor: value ? "#fff" : "#3f3f46",
              justifyContent: "center",
              paddingHorizontal: scaleSize(3),
            }}
          >
            <View
              style={{
                width: scaleSize(28),
                height: scaleSize(28),
                borderRadius: scaleSize(14),
                backgroundColor: value ? "#000" : "#fff",
                alignSelf: value ? "flex-end" : "flex-start",
              }}
            />
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
};
