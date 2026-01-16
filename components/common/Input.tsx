import { useRef, useState } from "react";
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  TextInput,
  type TextInputProps,
  View,
} from "react-native";

interface InputProps extends TextInputProps {
  extraClassName?: string;
}

export function Input(props: InputProps) {
  const { style, extraClassName = "", ...otherProps } = props;
  const inputRef = useRef<TextInput>(null);
  const [isFocused, setIsFocused] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;

  const animateFocus = (focused: boolean) => {
    Animated.timing(scale, {
      toValue: focused ? 1.02 : 1,
      duration: 150,
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

  if (Platform.isTV) {
    return (
      <Pressable
        onPress={() => inputRef.current?.focus()}
        onFocus={handleFocus}
        onBlur={handleBlur}
      >
        <Animated.View
          style={{
            transform: [{ scale }],
          }}
        >
          {/* Outer glow when focused */}
          {isFocused && (
            <View
              style={{
                position: "absolute",
                top: -4,
                left: -4,
                right: -4,
                bottom: -4,
                backgroundColor: "#9334E9",
                borderRadius: 18,
                opacity: 0.5,
              }}
            />
          )}

          <View
            style={{
              backgroundColor: isFocused ? "#2a2a2a" : "#1a1a1a",
              borderWidth: 3,
              borderColor: isFocused ? "#FFFFFF" : "#333333",
              borderRadius: 14,
              overflow: "hidden",
            }}
          >
            {/* Purple accent bar at top when focused */}
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
                  height: 60,
                  fontSize: 22,
                  fontWeight: "500",
                  paddingHorizontal: 20,
                  paddingTop: isFocused ? 4 : 0,
                  color: "#FFFFFF",
                  backgroundColor: "transparent",
                },
                style,
              ]}
              onFocus={handleFocus}
              onBlur={handleBlur}
              {...otherProps}
            />
          </View>
        </Animated.View>
      </Pressable>
    );
  }

  // Mobile version unchanged
  return (
    <TextInput
      ref={inputRef}
      className={`p-4 rounded-xl bg-neutral-900 ${extraClassName}`}
      allowFontScaling={false}
      style={[{ color: "white" }, style]}
      placeholderTextColor={"#9CA3AF"}
      clearButtonMode='while-editing'
      {...otherProps}
    />
  );
}
