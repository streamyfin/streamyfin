import React from "react";
import { TextInput, TextInputProps } from "react-native";
export function Input(props: TextInputProps) {
  const { style, ...otherProps } = props;
  const inputRef = React.useRef<TextInput>(null);

  return (
    <TextInput
      ref={inputRef}
      className="p-4 border border-neutral-800 rounded-xl bg-neutral-900"
      allowFontScaling={false}
      style={[{ color: "white" }, style]}
      placeholderTextColor={"#9CA3AF"}
      clearButtonMode="while-editing"
      {...otherProps}
    />
  );
}
