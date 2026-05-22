import React, { useRef } from "react";
import { Animated, Pressable, TextInput } from "react-native";
import { Text } from "@/components/common/Text";
import { useScaledTVTypography } from "@/constants/TVTypography";
import { scaleSize } from "@/utils/scaleSize";
import { useTVFocusAnimation } from "../hooks/useTVFocusAnimation";

export interface TVSettingsTextInputProps {
  label: string;
  value: string;
  placeholder?: string;
  onChangeText: (text: string) => void;
  onBlur?: () => void;
  secureTextEntry?: boolean;
  disabled?: boolean;
}

export const TVSettingsTextInput: React.FC<TVSettingsTextInputProps> = ({
  label,
  value,
  placeholder,
  onChangeText,
  onBlur,
  secureTextEntry,
  disabled,
}) => {
  const typography = useScaledTVTypography();
  const inputRef = useRef<TextInput>(null);
  const { focused, handleFocus, handleBlur, animatedStyle } =
    useTVFocusAnimation({ scaleAmount: 1.02 });

  const handleInputBlur = () => {
    handleBlur();
    onBlur?.();
  };

  return (
    <Pressable
      onPress={() => inputRef.current?.focus()}
      onFocus={handleFocus}
      onBlur={handleInputBlur}
      disabled={disabled}
      focusable={!disabled}
    >
      <Animated.View
        style={[
          animatedStyle,
          {
            backgroundColor: focused
              ? "rgba(255, 255, 255, 0.15)"
              : "rgba(255, 255, 255, 0.05)",
            borderRadius: scaleSize(12),
            paddingVertical: scaleSize(16),
            paddingHorizontal: scaleSize(24),
            marginBottom: scaleSize(8),
          },
        ]}
      >
        <Text
          style={{
            fontSize: typography.callout,
            color: "#9CA3AF",
            marginBottom: scaleSize(8),
          }}
        >
          {label}
        </Text>
        <TextInput
          ref={inputRef}
          value={value}
          placeholder={placeholder}
          placeholderTextColor='#6B7280'
          onChangeText={onChangeText}
          onBlur={handleInputBlur}
          secureTextEntry={secureTextEntry}
          autoCapitalize='none'
          autoCorrect={false}
          style={{
            fontSize: typography.body,
            color: "#FFFFFF",
            backgroundColor: "rgba(255, 255, 255, 0.05)",
            borderRadius: scaleSize(8),
            paddingVertical: scaleSize(12),
            paddingHorizontal: scaleSize(16),
            borderWidth: focused ? scaleSize(2) : scaleSize(1),
            borderColor: focused ? "#FFFFFF" : "#4B5563",
          }}
        />
      </Animated.View>
    </Pressable>
  );
};
