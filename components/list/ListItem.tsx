import { Ionicons } from "@expo/vector-icons";
import type { PropsWithChildren, ReactNode } from "react";
import { Platform, TouchableOpacity, View, type ViewProps } from "react-native";
import { Text } from "../common/Text";

interface Props extends ViewProps {
  title?: string | null | undefined;
  subtitle?: string | null | undefined;
  value?: string | null | undefined;
  children?: ReactNode;
  iconAfter?: ReactNode;
  icon?: keyof typeof Ionicons.glyphMap;
  showArrow?: boolean;
  textColor?: "default" | "blue" | "red";
  onPress?: () => void;
  disabled?: boolean;
}

export const ListItem: React.FC<PropsWithChildren<Props>> = ({
  title,
  subtitle,
  value,
  iconAfter,
  children,
  showArrow = false,
  icon,
  textColor = "default",
  onPress,
  disabled = false,
  ...viewProps
}) => {
  if (onPress)
    return (
      <TouchableOpacity
        disabled={disabled}
        onPress={onPress}
        className={`flex flex-row items-center justify-between bg-neutral-900 ${
          Platform.OS === "android" ? "min-h-12" : "min-h-[44px]"
        } pr-4 pl-4 ${disabled ? "opacity-50" : ""}`}
        {...(viewProps as any)}
      >
        <ListItemContent
          title={title}
          subtitle={subtitle}
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
      className={`flex flex-row items-center justify-between bg-neutral-900 ${
        Platform.OS === "android" ? "min-h-12" : "min-h-[44px]"
      } pr-4 pl-4 ${disabled ? "opacity-50" : ""}`}
      {...viewProps}
    >
      <ListItemContent
        title={title}
        subtitle={subtitle}
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
  subtitle,
  textColor,
  icon,
  value,
  showArrow,
  iconAfter,
  children,
}: Props) => {
  return (
    <>
      <View className='flex flex-row items-center w-full'>
        {icon && (
          <View className='border border-neutral-800 rounded-md h-8 w-8 flex items-center justify-center mr-2'>
            <Ionicons name='person-circle-outline' size={18} color='white' />
          </View>
        )}
        <View className='flex-1'>
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
          {subtitle && (
            <Text className='text-[#9899A1] text-sm mt-0.5' numberOfLines={2}>
              {subtitle}
            </Text>
          )}
        </View>
        {value && (
          <View className='ml-auto items-end'>
            <Text selectable className=' text-[#9899A1]' numberOfLines={1}>
              {value}
            </Text>
          </View>
        )}
        {children && <View className='ml-auto'>{children}</View>}
        {showArrow && (
          <View className={children ? "ml-1" : "ml-auto"}>
            <Ionicons name='chevron-forward' size={18} color='#5A5960' />
          </View>
        )}
      </View>
      {iconAfter}
    </>
  );
};
