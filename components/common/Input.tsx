import React, { forwardRef } from "react";
import { Platform, TextInput, TextInputProps } from "react-native";

export const Input = forwardRef<TextInput, TextInputProps>((props, ref) => {
  const { style, ...otherProps } = props;

  return (
    <TextInput
      ref={ref}
      className="p-4 rounded-xl bg-neutral-900"
      allowFontScaling={false}
      style={[{ color: "white" }, style]}
      placeholderTextColor={"#9CA3AF"}
      clearButtonMode="while-editing"
      {...otherProps}
    />
  );
});
