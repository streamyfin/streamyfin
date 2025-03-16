import React from "react";
import {
  Platform,
  TextInput,
  type TextInputProps,
  TouchableOpacity,
} from "react-native";
export function Input(props: TextInputProps) {
  const { style, ...otherProps } = props;
  const inputRef = React.useRef<TextInput>(null);

  return Platform.isTV ? (
    <TouchableOpacity onFocus={() => inputRef?.current?.focus?.()}>
      <TextInput
        ref={inputRef}
        className='p-4  rounded-xl bg-neutral-900'
        allowFontScaling={false}
        style={[{ color: "white" }, style]}
        placeholderTextColor={"#9CA3AF"}
        clearButtonMode='while-editing'
        {...otherProps}
      />
    </TouchableOpacity>
  ) : (
    <TextInput
      ref={inputRef}
      className='p-4  rounded-xl bg-neutral-900'
      allowFontScaling={false}
      style={[{ color: "white" }, style]}
      placeholderTextColor={"#9CA3AF"}
      clearButtonMode='while-editing'
      {...otherProps}
    />
  );
}
