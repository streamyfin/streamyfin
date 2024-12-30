import React from "react";
import { TextProps } from "react-native";
import { UITextView } from "react-native-uitextview";

export function Text(
  props: TextProps & {
    uiTextView?: boolean;
  }
) {
  const { style, ...otherProps } = props;

  return (
    <UITextView
      allowFontScaling={false}
      style={[{ color: "white" }, style]}
      {...otherProps}
    />
  );
}
