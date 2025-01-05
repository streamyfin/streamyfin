import * as Haptics from "expo-haptics";
import React, { PropsWithChildren, ReactNode, useMemo } from "react";
import { Text, TouchableOpacity, View } from "react-native";
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
  const colorClasses = useMemo(() => {
    switch (color) {
      case "purple":
        return "bg-purple-600 active:bg-purple-700";
      case "red":
        return "bg-red-600";
      case "black":
        return "bg-neutral-900 border border-neutral-800";
      case "transparent":
        return "bg-transparent";
    }
  }, [color]);

  return (
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
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      }}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <View className="p-0.5">
          <Loader />
        </View>
      ) : (
        <View
          className={`
            flex flex-row items-center justify-between w-full
            ${justify === "between" ? "justify-between" : "justify-center"}`}
        >
          {iconLeft ? iconLeft : <View className="w-4"></View>}
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
          {iconRight ? iconRight : <View className="w-4"></View>}
        </View>
      )}
    </TouchableOpacity>
  );
};
