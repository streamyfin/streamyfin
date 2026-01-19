import { Platform, Text as RNText, type TextProps } from "react-native";
export function Text(props: TextProps) {
  const { style, ...otherProps } = props;
  if (Platform.isTV)
    return (
      <RNText
        maxFontSizeMultiplier={1.3}
        style={[{ color: "white" }, style]}
        {...otherProps}
      />
    );

  return (
    <RNText
      maxFontSizeMultiplier={1.3}
      style={[{ color: "white" }, style]}
      {...otherProps}
    />
  );
}
