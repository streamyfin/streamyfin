import React, { useState } from "react";
import {
  Platform,
  TextInput,
  type TextInputProps,
  TouchableOpacity,
} from "react-native";

interface InputProps extends TextInputProps {
  extraClassName?: string; // new prop for additional classes
}

export function Input(props: InputProps) {
  const { style, extraClassName = "", ...otherProps } = props;
  const inputRef = React.useRef<TextInput>(null);
  const [isFocused, setIsFocused] = useState(false);

  return Platform.isTV ? (
    <TouchableOpacity onFocus={() => inputRef?.current?.focus?.()}>
      <TextInput
        ref={inputRef}
        className={`
          w-full text-lg px-5 py-5 rounded-2xl
          ${isFocused ? "bg-neutral-700 border-2 border-white" : "bg-neutral-900 border-2 border-neutral-800"}
          text-white ${extraClassName}
        `}
        allowFontScaling={false}
        style={[
          style,
          {
            backgroundColor: isFocused ? "#ffffff88" : "#8f8d8d88",
          },
        ]}
        placeholderTextColor={"#ffffffff"}
        clearButtonMode='while-editing'
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        {...otherProps}
      />
    </TouchableOpacity>
  ) : (
    <TextInput
      ref={inputRef}
      className={`p-3 rounded-xl bg-neutral-900 ${
        isFocused ? "border-2 border-white" : "border-2 border-neutral-800"
      } ${extraClassName}`}
      allowFontScaling={false}
      style={[{ color: "white" }, style]}
      placeholderTextColor={"#9CA3AF"}
      clearButtonMode='while-editing'
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      {...otherProps}
    />
  );
}
