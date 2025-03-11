import React from "react";
import { Platform, TextProps } from "react-native";
import { UITextView } from "react-native-uitextview";
import { Text as RNText } from "react-native";
export function Text(
  props: TextProps & {
    uiTextView?: boolean;
  },
) {
  const { style, ...otherProps } = props;
  if (Platform.isTV)
    return (
      <RNText
        allowFontScaling={false}
        style={[{ color: "white" }, style]}
        {...otherProps}
      />
    );
  else
    return (
      <UITextView
        allowFontScaling={false}
        style={[{ color: "white" }, style]}
        {...otherProps}
      />
    );
}
