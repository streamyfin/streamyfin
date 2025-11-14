import { Platform, Text as RNText, type TextProps } from "react-native";

export function Text({ className, ...props }: TextProps) {
  if (Platform.isTV)
    return (
      <RNText allowFontScaling={false} style={{ color: "white" }} {...props} />
    );

  return (
    <RNText
      allowFontScaling={false}
      className={`text-white ${className}`}
      {...props}
    />
  );
}
