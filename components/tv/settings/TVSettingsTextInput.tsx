import React, { useRef } from "react";
import { Animated, Pressable, TextInput } from "react-native";
import { Text } from "@/components/common/Text";
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
            borderRadius: 12,
            paddingVertical: 16,
            paddingHorizontal: 24,
            marginBottom: 8,
          },
        ]}
      >
        <Text style={{ fontSize: 16, color: "#9CA3AF", marginBottom: 8 }}>
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
            fontSize: 18,
            color: "#FFFFFF",
            backgroundColor: "rgba(255, 255, 255, 0.05)",
            borderRadius: 8,
            paddingVertical: 12,
            paddingHorizontal: 16,
            borderWidth: focused ? 2 : 1,
            borderColor: focused ? "#FFFFFF" : "#4B5563",
          }}
        />
      </Animated.View>
    </Pressable>
  );
};
