import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
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
    const containerStyle = {
      height: 48,
      borderRadius: 50,
      borderWidth: isFocused ? 1.5 : 1,
      borderColor: isFocused
        ? "rgba(255, 255, 255, 0.3)"
        : "rgba(255, 255, 255, 0.1)",
      overflow: "hidden" as const,
      flexDirection: "row" as const,
      alignItems: "center" as const,
      paddingLeft: 16,
    };

    const inputElement = (
      <>
        <Ionicons
          name='search'
          size={20}
          color={isFocused ? "#999" : "#666"}
          style={{ marginRight: 12 }}
        />
        <TextInput
          ref={inputRef}
          allowFontScaling={false}
          placeholderTextColor='#666'
          style={[
            {
              flex: 1,
              height: 48,
              fontSize: 18,
              fontWeight: "400",
              color: "#FFFFFF",
              backgroundColor: "transparent",
            },
            style,
          ]}
          onFocus={handleFocus}
          onBlur={handleBlur}
          {...otherProps}
        />
      </>
    );

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
          {Platform.OS === "ios" ? (
            <BlurView
              intensity={isFocused ? 90 : 80}
              tint='dark'
              style={containerStyle}
            >
              {inputElement}
            </BlurView>
          ) : (
            <View
              style={[
                containerStyle,
                {
                  backgroundColor: isFocused
                    ? "rgba(255, 255, 255, 0.12)"
                    : "rgba(255, 255, 255, 0.08)",
                },
              ]}
            >
              {inputElement}
            </View>
          )}
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
