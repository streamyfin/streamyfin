import React, { useRef, useState } from "react";
import {
  Animated,
  Easing,
  Pressable,
  TextInput,
  type TextInputProps,
  View,
} from "react-native";
import { Text } from "@/components/common/Text";

interface TVInputProps extends TextInputProps {
  label?: string;
  hasTVPreferredFocus?: boolean;
}

export const TVInput: React.FC<TVInputProps> = ({
  label,
  hasTVPreferredFocus,
  style,
  ...props
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const scale = useRef(new Animated.Value(1)).current;

  const animateFocus = (focused: boolean) => {
    Animated.timing(scale, {
      toValue: focused ? 1.02 : 1,
      duration: 200,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
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
    <View>
      {label && (
        <Text
          style={{
            fontSize: 18,
            color: isFocused ? "#FFFFFF" : "#9CA3AF",
            marginBottom: 8,
            marginLeft: 4,
          }}
        >
          {label}
        </Text>
      )}
      <Pressable
        onPress={() => inputRef.current?.focus()}
        onFocus={handleFocus}
        onBlur={handleBlur}
        hasTVPreferredFocus={hasTVPreferredFocus}
      >
        <Animated.View
          style={{
            transform: [{ scale }],
          }}
        >
          {/* Outer glow layer - only visible when focused */}
          {isFocused && (
            <View
              style={{
                position: "absolute",
                top: -4,
                left: -4,
                right: -4,
                bottom: -4,
                backgroundColor: "#9334E9",
                borderRadius: 20,
                opacity: 0.4,
              }}
            />
          )}

          {/* Main input container */}
          <View
            style={{
              backgroundColor: isFocused ? "#3a3a3a" : "#1a1a1a",
              borderWidth: 3,
              borderColor: isFocused ? "#FFFFFF" : "#333333",
              borderRadius: 16,
              overflow: "hidden",
            }}
          >
            {/* Inner highlight bar when focused */}
            {isFocused && (
              <View
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  height: 3,
                  backgroundColor: "#9334E9",
                }}
              />
            )}

            <TextInput
              ref={inputRef}
              allowFontScaling={false}
              placeholderTextColor={isFocused ? "#AAAAAA" : "#666666"}
              style={[
                {
                  height: 68,
                  fontSize: 26,
                  fontWeight: "500",
                  paddingHorizontal: 24,
                  paddingTop: isFocused ? 6 : 0,
                  color: "#FFFFFF",
                  backgroundColor: "transparent",
                },
                style,
              ]}
              onFocus={handleFocus}
              onBlur={handleBlur}
              {...props}
            />
          </View>
        </Animated.View>
      </Pressable>
    </View>
  );
};
