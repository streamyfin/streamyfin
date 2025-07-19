import React from "react";
import { Platform, type TextProps } from "react-native";
import { Text as RNText } from "react-native";
export function Text(props: TextProps) {
  const { style, ...otherProps } = props;
  if (Platform.isTV)
    return (
      <RNText
        allowFontScaling={false}
        style={[{ color: "white" }, style]}
        {...otherProps}
      />
    );

  return (
    <RNText
      allowFontScaling={false}
      style={[{ color: "white" }, style]}
      {...otherProps}
    />
  );
}
