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

  const colorClasses = useMemo(() => {
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
    }
  }, [color, focused]);

  const lightHapticFeedback = useHaptic("light");

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
            ${focused ? "bg-purple-500 border-2 border-white" : "bg-purple-600 border border-purple-700"}
            ${className}`}
        >
          <Text className='text-white text-xl font-bold'>{children}</Text>
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
          text-white font-bold text-base
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
