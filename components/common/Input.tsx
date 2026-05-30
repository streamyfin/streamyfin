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
import { useScaledTVTypography } from "@/constants/TVTypography";

interface InputProps extends TextInputProps {
  extraClassName?: string;
}

export function Input(props: InputProps) {
  const { style, extraClassName = "", ...otherProps } = props;
  const inputRef = useRef<TextInput>(null);
  const [isFocused, setIsFocused] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;
  // TV-only: scales the input font with the tvTypographyScale setting.
  // Not consumed by the mobile branch below.
  const tvTypography = useScaledTVTypography();

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
    // Scale the whole input (box height, padding, icon) proportionally with the
    // font so the component grows/shrinks with the tvTypographyScale setting.
    // Uses the `body` token (primary reading size); it resolves to 28 at Default.
    const fontSize = tvTypography.body;
    const factor = fontSize / 28;
    const height = Math.round(56 * factor);
    const paddingLeft = Math.round(24 * factor);
    const iconSize = Math.round(26 * factor);
    const iconMarginRight = Math.round(14 * factor);

    const containerStyle = {
      height,
      borderRadius: 50,
      borderWidth: isFocused ? 1.5 : 1,
      borderColor: isFocused
        ? "rgba(255, 255, 255, 0.3)"
        : "rgba(255, 255, 255, 0.1)",
      overflow: "hidden" as const,
      flexDirection: "row" as const,
      alignItems: "center" as const,
      paddingLeft,
    };

    const inputElement = (
      <>
        <Ionicons
          name='search'
          size={iconSize}
          color={isFocused ? "#999" : "#666"}
          style={{ marginRight: iconMarginRight }}
        />
        <TextInput
          ref={inputRef}
          allowFontScaling={false}
          placeholderTextColor='#666'
          style={[
            {
              flex: 1,
              height,
              fontSize,
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
