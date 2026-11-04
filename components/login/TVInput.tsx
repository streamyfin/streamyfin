import React, { useRef, useState } from "react";
import {
  Animated,
  Easing,
  Pressable,
  TextInput,
  type TextInputProps,
} from "react-native";
import { useScaledTVTypography } from "@/constants/TVTypography";
import { scaleSize } from "@/utils/scaleSize";

interface TVInputProps extends TextInputProps {
  label?: string;
  hasTVPreferredFocus?: boolean;
  disabled?: boolean;
}

export const TVInput: React.FC<TVInputProps> = ({
  label,
  placeholder,
  hasTVPreferredFocus,
  disabled = false,
  style,
  ...props
}) => {
  const typography = useScaledTVTypography();
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

  const displayPlaceholder = placeholder || label;

  return (
    <Pressable
      onPress={() => inputRef.current?.focus()}
      onFocus={handleFocus}
      onBlur={handleBlur}
      hasTVPreferredFocus={hasTVPreferredFocus && !disabled}
      disabled={disabled}
      focusable={!disabled}
    >
      <Animated.View
        style={{
          transform: [{ scale }],
          borderRadius: scaleSize(12),
          backgroundColor: isFocused
            ? "rgba(255,255,255,0.15)"
            : "rgba(255,255,255,0.08)",
          borderWidth: 2,
          borderColor: isFocused ? "#FFFFFF" : "transparent",
        }}
      >
        <TextInput
          ref={inputRef}
          placeholder={displayPlaceholder}
          placeholderTextColor='rgba(255,255,255,0.35)'
          allowFontScaling={false}
          style={[
            {
              // A floor, not a fixed height: Android pads a TextInput inside
              // its height, which cut the top off the larger text sizes.
              minHeight: scaleSize(64),
              fontSize: typography.heading,
              color: "#FFFFFF",
              paddingHorizontal: scaleSize(20),
            },
            style,
          ]}
          onFocus={handleFocus}
          onBlur={handleBlur}
          {...props}
        />
      </Animated.View>
    </Pressable>
  );
};
