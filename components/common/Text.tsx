import { Platform, Text as RNText, type TextProps } from "react-native";
export function Text(props: Readonly<TextProps>) {
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
