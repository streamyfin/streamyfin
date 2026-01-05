import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import type { PropsWithChildren } from "react";
import { Platform, TouchableOpacity, type ViewProps } from "react-native";
import { useHaptic } from "@/hooks/useHaptic";

interface Props extends ViewProps {
  onPress?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  background?: boolean;
  size?: "default" | "large";
  fillColor?: "primary";
  color?: "white" | "purple";
  hapticFeedback?: boolean;
}

export const RoundButton: React.FC<PropsWithChildren<Props>> = ({
  background = true,
  icon,
  onPress,
  children,
  size = "default",
  fillColor,
  color = "white",
  hapticFeedback = true,
  ...viewProps
}) => {
  const buttonSize = size === "large" ? "h-10 w-10" : "h-9 w-9";
  const fillColorClass = fillColor === "primary" ? "bg-purple-600" : "";
  const lightHapticFeedback = useHaptic("light");

  const handlePress = () => {
    if (hapticFeedback) {
      lightHapticFeedback();
    }
    onPress?.();
  };

  if (Platform.OS === "ios") {
    return (
      <TouchableOpacity
        onPress={handlePress}
        className={`rounded-full ${buttonSize} flex items-center justify-center ${fillColorClass}`}
        {...(viewProps as any)}
      >
        {icon ? (
          <Ionicons
            name={icon}
            size={size === "large" ? 22 : 18}
            color={color === "white" ? "white" : "#9334E9"}
          />
        ) : null}
        {children ? children : null}
      </TouchableOpacity>
    );
  }

  if (fillColor)
    return (
      <TouchableOpacity
        onPress={handlePress}
        className={`rounded-full ${buttonSize} flex items-center justify-center ${fillColorClass}`}
        {...(viewProps as any)}
      >
        {icon ? (
          <Ionicons
            name={icon}
            size={size === "large" ? 22 : 18}
            color={"white"}
          />
        ) : null}
        {children ? children : null}
      </TouchableOpacity>
    );

  if (background === false)
    return (
      <TouchableOpacity
        onPress={handlePress}
        className={`rounded-full ${buttonSize} flex items-center justify-center ${fillColorClass}`}
        {...(viewProps as any)}
      >
        {icon ? (
          <Ionicons
            name={icon}
            size={size === "large" ? 22 : 18}
            color={"white"}
          />
        ) : null}
        {children ? children : null}
      </TouchableOpacity>
    );

  if (Platform.OS === "android")
    return (
      <TouchableOpacity
        onPress={handlePress}
        className={`rounded-full ${buttonSize} flex items-center justify-center ${
          fillColor ? fillColorClass : "bg-transparent"
        }`}
        {...(viewProps as any)}
      >
        {icon ? (
          <Ionicons
            name={icon}
            size={size === "large" ? 22 : 18}
            color={color === "white" ? "white" : "#9334E9"}
          />
        ) : null}
        {children ? children : null}
      </TouchableOpacity>
    );

  return (
    <TouchableOpacity onPress={handlePress} {...(viewProps as any)}>
      <BlurView
        intensity={90}
        className={`rounded-full overflow-hidden ${buttonSize} flex items-center justify-center ${fillColorClass}`}
        {...(viewProps as any)}
      >
        {icon ? (
          <Ionicons
            name={icon}
            size={size === "large" ? 22 : 18}
            color={"white"}
          />
        ) : null}
        {children ? children : null}
      </BlurView>
    </TouchableOpacity>
  );
};
