import { Ionicons } from "@expo/vector-icons";
import { PropsWithChildren, ReactNode, forwardRef } from "react";
import {
  TouchableOpacity,
  TouchableOpacityProps,
  View,
  ViewProps,
  Platform,
} from "react-native";
import { Text } from "../common/Text";
import { TVFocusable } from "../common/TVFocusable";

interface Props extends TouchableOpacityProps, ViewProps {
  title?: string | null | undefined;
  value?: string | null | undefined;
  children?: ReactNode;
  iconAfter?: ReactNode;
  icon?: keyof typeof Ionicons.glyphMap;
  showArrow?: boolean;
  textColor?: "default" | "blue" | "red";
  onPress?: () => void;
  hasTVPreferredFocus?: boolean;
}

export const ListItem = forwardRef<any, PropsWithChildren<Props>>(
  (
    {
      title,
      value,
      iconAfter,
      children,
      showArrow = false,
      icon,
      textColor = "default",
      onPress,
      disabled = false,
      hasTVPreferredFocus = false,
      ...props
    },
    ref,
  ) => {
    const content = (
      <ListItemContent
        title={title}
        value={value}
        icon={icon}
        textColor={textColor}
        showArrow={showArrow}
        iconAfter={iconAfter}
      >
        {children}
      </ListItemContent>
    );

    if (onPress) {
      if (Platform.isTV) {
        return (
          <TVFocusable
            ref={ref}
            hasTVPreferredFocus={hasTVPreferredFocus}
            onSelect={onPress}
            className={`flex flex-row items-center justify-between bg-neutral-900 h-11 pr-4 pl-4 ${
              disabled ? "opacity-50" : ""
            }`}
            {...props}
          >
            {content}
          </TVFocusable>
        );
      }

      return (
        <TouchableOpacity
          ref={ref}
          disabled={disabled}
          onPress={onPress}
          className={`flex flex-row items-center justify-between bg-neutral-900 h-11 pr-4 pl-4 ${
            disabled ? "opacity-50" : ""
          }`}
          {...props}
        >
          {content}
        </TouchableOpacity>
      );
    }

    return (
      <View
        ref={ref}
        className={`flex flex-row items-center justify-between bg-neutral-900 h-11 pr-4 pl-4 ${
          disabled ? "opacity-50" : ""
        }`}
        {...props}
      >
        {content}
      </View>
    );
  },
);

const ListItemContent = ({
  title,
  textColor,
  icon,
  value,
  showArrow,
  iconAfter,
  children,
  ...props
}: Props) => {
  return (
    <>
      <View className="flex flex-row items-center w-full">
        {icon && (
          <View className="border border-neutral-800 rounded-md h-8 w-8 flex items-center justify-center mr-2">
            <Ionicons name="person-circle-outline" size={18} color="white" />
          </View>
        )}
        <Text
          className={
            textColor === "blue"
              ? "text-[#0584FE]"
              : textColor === "red"
                ? "text-red-600"
                : "text-white"
          }
          numberOfLines={1}
        >
          {title}
        </Text>
        {value && (
          <View className="ml-auto items-end">
            <Text selectable className=" text-[#9899A1]" numberOfLines={1}>
              {value}
            </Text>
          </View>
        )}
        {children && <View className="ml-auto">{children}</View>}
        {showArrow && (
          <View className={children ? "ml-1" : "ml-auto"}>
            <Ionicons name="chevron-forward" size={18} color="#5A5960" />
          </View>
        )}
      </View>
      {iconAfter}
    </>
  );
};
