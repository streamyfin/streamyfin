import { PropsWithChildren, ReactNode } from "react";
import {
  TouchableOpacity,
  TouchableOpacityProps,
  View,
  ViewProps,
} from "react-native";
import { Text } from "../common/Text";
import { Ionicons } from "@expo/vector-icons";

interface Props extends TouchableOpacityProps, ViewProps {
  title?: string | null | undefined;
  value?: string | null | undefined;
  children?: ReactNode;
  iconAfter?: ReactNode;
  icon?: keyof typeof Ionicons.glyphMap;
  showArrow?: boolean;
  textColor?: "default" | "blue" | "red";
  onPress?: () => void;
}

export const ListItem: React.FC<PropsWithChildren<Props>> = ({
  title,
  value,
  iconAfter,
  children,
  showArrow = false,
  icon,
  textColor = "default",
  onPress,
  disabled = false,
  ...props
}) => {
  if (onPress)
    return (
      <TouchableOpacity
        disabled={disabled}
        onPress={onPress}
        className={`flex flex-row items-center justify-between bg-neutral-900 h-11 pr-4 ${
          disabled ? "opacity-50" : ""
        }`}
        {...props}
      >
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
      </TouchableOpacity>
    );
  return (
    <View
      className={`flex flex-row items-center justify-between bg-neutral-900 h-11 pr-4 ${
        disabled ? "opacity-50" : ""
      }`}
      {...props}
    >
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
    </View>
  );
};

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
