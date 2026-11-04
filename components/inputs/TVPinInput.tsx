import React, { useRef, useState } from "react";
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  TextInput,
  type TextInputProps,
} from "react-native";
import { Text } from "@/components/common/Text";
import { useScaledTVTypography } from "@/constants/TVTypography";

interface TVPinInputProps
  extends Omit<TextInputProps, "value" | "onChangeText" | "style"> {
  value: string;
  onChangeText: (text: string) => void;
  length?: number;
  label?: string;
  hasTVPreferredFocus?: boolean;
}

export interface TVPinInputRef {
  focus: () => void;
}

const TVPinInputComponent = React.forwardRef<TVPinInputRef, TVPinInputProps>(
  (props, ref) => {
    const {
      value,
      onChangeText,
      length = 4,
      label,
      hasTVPreferredFocus,
      placeholder,
      ...rest
    } = props;

    const typography = useScaledTVTypography();
    const inputRef = useRef<TextInput>(null);
    const [isFocused, setIsFocused] = useState(false);
    const scale = useRef(new Animated.Value(1)).current;

    React.useImperativeHandle(
      ref,
      () => ({
        focus: () => inputRef.current?.focus(),
      }),
      [],
    );

    const animateFocus = (focused: boolean) => {
      Animated.timing(scale, {
        toValue: focused ? 1.02 : 1,
        duration: 150,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    };

    const handleChangeText = (text: string) => {
      // Only allow numeric input and limit to length
      const numericText = text.replace(/[^0-9]/g, "").slice(0, length);
      onChangeText(numericText);
    };

    return (
      <Pressable
        onPress={() => inputRef.current?.focus()}
        onFocus={() => {
          setIsFocused(true);
          animateFocus(true);
          inputRef.current?.focus();
        }}
        onBlur={() => {
          setIsFocused(false);
          animateFocus(false);
        }}
        hasTVPreferredFocus={hasTVPreferredFocus}
      >
        <Animated.View
          style={[
            styles.container,
            {
              transform: [{ scale }],
              borderColor: isFocused ? "#6366F1" : "#374151",
            },
          ]}
        >
          {label && (
            <Text style={[styles.label, { fontSize: typography.callout }]}>
              {label}
            </Text>
          )}
          <TextInput
            ref={inputRef}
            value={value}
            onChangeText={handleChangeText}
            keyboardType='number-pad'
            maxLength={length}
            secureTextEntry
            placeholder={placeholder || `Enter ${length}-digit PIN`}
            placeholderTextColor='#6B7280'
            style={[styles.input, { fontSize: typography.heading }]}
            onFocus={() => {
              setIsFocused(true);
              animateFocus(true);
            }}
            onBlur={() => {
              setIsFocused(false);
              animateFocus(false);
            }}
            {...rest}
          />
        </Animated.View>
      </Pressable>
    );
  },
);

TVPinInputComponent.displayName = "TVPinInput";

export const TVPinInput = TVPinInputComponent;

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#1F2937",
    borderRadius: 12,
    borderWidth: 2,
    paddingHorizontal: 20,
    paddingVertical: 4,
    minWidth: 280,
  },
  label: {
    color: "rgba(255,255,255,0.6)",
    marginBottom: 4,
    marginTop: 8,
  },
  input: {
    color: "#fff",
    fontWeight: "500",
    textAlign: "center",
    minHeight: 56,
    letterSpacing: 8,
  },
});
