import { BlurView } from "expo-blur";
import type React from "react";
import { Platform, View, type ViewProps } from "react-native";
interface Props extends ViewProps {
  blurAmount?: number;
  blurType?: "light" | "dark" | "xlight";
}

/**
 * BlurView for iOS and simple View for Android
 */
export const PlatformBlurView: React.FC<Props> = ({
  blurAmount = 100,
  blurType = "light",
  style,
  children,
  ...props
}) => {
  if (Platform.OS === "ios") {
    return (
      <BlurView style={style} intensity={blurAmount} {...props}>
        {children}
      </BlurView>
    );
  }

  return (
    <View
      style={[{ backgroundColor: "rgba(50, 50, 50, 0.9)" }, style]}
      {...props}
    >
      {children}
    </View>
  );
};
