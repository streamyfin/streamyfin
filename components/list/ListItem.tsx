import { Ionicons } from "@expo/vector-icons";
import type { PropsWithChildren, ReactNode } from "react";
import { TouchableOpacity, View, type ViewProps } from "react-native";
import { Text } from "../common/Text";

interface Props extends ViewProps {
  title?: string | null | undefined;
  subtitle?: string | null | undefined;
  subtitleColor?: "default" | "red";
  value?: string | null | undefined;
  children?: ReactNode;
  iconAfter?: ReactNode;
  icon?: keyof typeof Ionicons.glyphMap;
  showArrow?: boolean;
  textColor?: "default" | "blue" | "red";
  onPress?: () => void;
  disabled?: boolean;
  disabledByAdmin?: boolean;
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
  disabledByAdmin = false,
  ...viewProps
}) => {
  const effectiveSubtitle = disabledByAdmin ? "Disabled by admin" : subtitle;
  const isDisabled = disabled || disabledByAdmin;
  if (onPress)
    return (
      <TouchableOpacity
        disabled={isDisabled}
        onPress={onPress}
        className={`flex flex-row items-center justify-between bg-neutral-900 min-h-[42px] py-2 pr-4 pl-4 ${isDisabled ? "opacity-50" : ""}`}
        {...(viewProps as any)}
      >
        <ListItemContent
          title={title}
          subtitle={effectiveSubtitle}
          subtitleColor={disabledByAdmin ? "red" : undefined}
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
      className={`flex flex-row items-center justify-between bg-neutral-900 min-h-[42px] py-2 pr-4 pl-4 ${isDisabled ? "opacity-50" : ""}`}
      {...viewProps}
    >
      <ListItemContent
        title={title}
        subtitle={effectiveSubtitle}
        subtitleColor={disabledByAdmin ? "red" : undefined}
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
  subtitleColor,
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
            <Text
              className={`text-[12px] mt-0.5 ${subtitleColor === "red" ? "text-red-600" : "text-[#9899A1]"}`}
              numberOfLines={2}
            >
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
