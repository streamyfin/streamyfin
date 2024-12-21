import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { PropsWithChildren } from "react";
import {
  Platform,
  TouchableOpacity,
  TouchableOpacityProps,
} from "react-native";

interface Props extends TouchableOpacityProps {
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  background?: boolean;
  size?: "default" | "large";
}

export const RoundButton: React.FC<PropsWithChildren<Props>> = ({
  background = true,
  icon,
  onPress,
  children,
  size = "default",
  ...props
}) => {
  const buttonSize = size === "large" ? "h-10 w-10" : "h-9 w-9";

  if (background === false)
    return (
      <TouchableOpacity
        onPress={onPress}
        className={`rounded-full ${buttonSize} flex items-center justify-center`}
        {...props}
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
        onPress={onPress}
        className={`rounded-full ${buttonSize} flex items-center justify-center bg-neutral-800/80`}
        {...props}
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

  return (
    <TouchableOpacity onPress={onPress} {...props}>
      <BlurView
        intensity={90}
        className={`rounded-full overflow-hidden ${buttonSize} flex items-center justify-center`}
        {...props}
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
