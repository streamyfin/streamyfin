import type React from "react";
import {
  type PropsWithChildren,
  type ReactNode,
  useRef,
  useState,
} from "react";
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useHaptic } from "@/hooks/useHaptic";
import { Loader } from "./Loader";

const getColorClasses = (
  color: "purple" | "red" | "black" | "transparent" | "white",
  variant: "solid" | "border",
  focused: boolean,
): string => {
  if (variant === "border") {
    switch (color) {
      case "purple":
        return focused
          ? "bg-transparent border-2 border-purple-400"
          : "bg-transparent border-2 border-purple-600";
      case "red":
        return focused
          ? "bg-transparent border-2 border-red-400"
          : "bg-transparent border-2 border-red-600";
      case "black":
        return focused
          ? "bg-transparent border-2 border-neutral-700"
          : "bg-transparent border-2 border-neutral-900";
      case "white":
        return focused
          ? "bg-transparent border-2 border-gray-100"
          : "bg-transparent border-2 border-white";
      case "transparent":
        return focused
          ? "bg-transparent border-2 border-gray-400"
          : "bg-transparent border-2 border-gray-600";
      default:
        return "";
    }
  } else {
    switch (color) {
      case "purple":
        return focused
          ? "bg-purple-500 border-2 border-white"
          : "bg-purple-600 border border-purple-700";
      case "red":
        return "bg-red-600";
      case "black":
        return "bg-neutral-900";
      case "white":
        return focused
          ? "bg-gray-100 border-2 border-gray-300"
          : "bg-white border border-gray-200";
      case "transparent":
        return "bg-transparent";
      default:
        return "";
    }
  }
};

export interface ButtonProps
  extends React.ComponentProps<typeof TouchableOpacity> {
  onPress?: () => void;
  className?: string;
  textClassName?: string;
  disabled?: boolean;
  children?: string | ReactNode;
  loading?: boolean;
  color?: "purple" | "red" | "black" | "transparent" | "white";
  variant?: "solid" | "border";
  iconRight?: ReactNode;
  iconLeft?: ReactNode;
  justify?: "center" | "between";
}

export const Button: React.FC<PropsWithChildren<ButtonProps>> = ({
  onPress,
  className = "",
  textClassName = "",
  disabled = false,
  loading = false,
  color = "purple",
  variant = "solid",
  iconRight,
  iconLeft,
  children,
  justify = "center",
  ...props
}) => {
  const [focused, setFocused] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = (v: number) =>
    Animated.timing(scale, {
      toValue: v,
      duration: 130,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();

  const colorClasses = getColorClasses(color, variant, focused);

  const lightHapticFeedback = useHaptic("light");

  const textColorClass =
    color === "white" && variant === "solid" ? "text-black" : "text-white";

  return Platform.isTV ? (
    <Pressable
      className='w-full'
      onPress={onPress}
      onFocus={() => {
        setFocused(true);
        animateTo(1.08);
      }}
      onBlur={() => {
        setFocused(false);
        animateTo(1);
      }}
    >
      <Animated.View
        style={{
          transform: [{ scale }],
          shadowColor: "#a855f7",
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: focused ? 0.9 : 0,
          shadowRadius: focused ? 18 : 0,
          elevation: focused ? 12 : 0, // Android glow
        }}
      >
        <View
          className={`rounded-2xl py-5 items-center justify-center 
            ${colorClasses}
            ${className}`}
        >
          <Text className={`${textColorClass} text-xl font-bold`}>
            {children}
          </Text>
        </View>
      </Animated.View>
    </Pressable>
  ) : (
    <TouchableOpacity
      className={`
        p-3 rounded-xl items-center justify-center
        ${(loading || disabled) && "opacity-50"}
        ${colorClasses}
        ${className}
      `}
      onPress={() => {
        if (!loading && !disabled && onPress) {
          onPress();
          lightHapticFeedback();
        }
      }}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <View className='p-0.5'>
          <Loader />
        </View>
      ) : (
        <View
          className={`
            flex flex-row items-center justify-between w-full
            ${justify === "between" ? "justify-between" : "justify-center"}`}
        >
          {iconLeft ? iconLeft : <View className='w-4' />}
          <Text
            className={`
          ${textColorClass} font-bold text-base
          ${disabled ? "text-gray-300" : ""}
          ${textClassName}
          ${iconRight ? "mr-2" : ""}
          ${iconLeft ? "ml-2" : ""}
        `}
          >
            {children}
          </Text>
          {iconRight ? iconRight : <View className='w-4' />}
        </View>
      )}
    </TouchableOpacity>
  );
};
