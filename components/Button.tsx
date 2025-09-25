import type React from "react";
import {
  type PropsWithChildren,
  type ReactNode,
  useMemo,
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

export interface ButtonProps
  extends React.ComponentProps<typeof TouchableOpacity> {
  onPress?: () => void;
  className?: string;
  textClassName?: string;
  disabled?: boolean;
  children?: string | ReactNode;
  loading?: boolean;
  color?: "purple" | "red" | "black" | "transparent";
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

  const getColorClasses = (color: string, focused: boolean) => {
    switch (color) {
      case "purple":
        return focused
          ? "bg-purple-500 border-2 border-white"
          : "bg-purple-600 border border-purple-700";
      case "red":
        return "bg-red-600";
      case "black":
        return "bg-neutral-900";
      case "transparent":
        return "bg-transparent";
      default:
        return "bg-purple-600 border border-purple-700";
    }
  };

  const colorClasses = useMemo(
    () => getColorClasses(color, focused),
    [color, focused],
  );

  const lightHapticFeedback = useHaptic("light");

  const handlePress = () => {
    if (!loading && !disabled && onPress) {
      onPress();
      lightHapticFeedback();
    }
  };

  const getTextClasses = () => {
    const baseClasses = "text-white font-bold text-base";
    const disabledClass = disabled ? " text-gray-300" : "";
    const rightMargin = iconRight ? " mr-2" : "";
    const leftMargin = iconLeft ? " ml-2" : "";
    return `${baseClasses}${disabledClass} ${textClassName}${rightMargin}${leftMargin}`;
  };

  const getJustifyClass = () => {
    return justify === "between" ? "justify-between" : "justify-center";
  };

  const renderTVButton = () => (
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
          elevation: focused ? 12 : 0,
        }}
      >
        <View
          className={`rounded-2xl py-5 items-center justify-center 
            ${focused ? "bg-purple-500 border-2 border-white" : "bg-purple-600 border border-purple-700"}
            ${className}`}
        >
          <Text className='text-white text-xl font-bold'>{children}</Text>
        </View>
      </Animated.View>
    </Pressable>
  );

  const renderTouchButton = () => (
    <TouchableOpacity
      className={`
        p-3 rounded-xl items-center justify-center
        ${(loading || disabled) && "opacity-50"}
        ${colorClasses}
        ${className}
      `}
      onPress={handlePress}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <View className='p-0.5'>
          <Loader />
        </View>
      ) : (
        <View
          className={`flex flex-row items-center justify-between w-full ${getJustifyClass()}`}
        >
          {iconLeft || <View className='w-4' />}
          <Text className={getTextClasses()}>{children}</Text>
          {iconRight || <View className='w-4' />}
        </View>
      )}
    </TouchableOpacity>
  );

  return Platform.isTV ? renderTVButton() : renderTouchButton();
};
