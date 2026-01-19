import React, { useRef, useState } from "react";
import {
  Animated,
  Easing,
  Pressable,
  TextInput,
  type TextInputProps,
} from "react-native";

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
          borderRadius: 10,
          borderWidth: 3,
          borderColor: isFocused ? "#FFFFFF" : "#333333",
        }}
      >
        <TextInput
          ref={inputRef}
          placeholder={displayPlaceholder}
          allowFontScaling={false}
          style={[
            {
              height: 68,
              fontSize: 24,
              color: "#FFFFFF",
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
