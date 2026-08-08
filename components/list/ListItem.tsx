import { Ionicons } from "@expo/vector-icons";
import type { PropsWithChildren, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Platform, TouchableOpacity, View, type ViewProps } from "react-native";
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
  const { t } = useTranslation();
  const effectiveSubtitle = disabledByAdmin
    ? t("home.settings.disabled_by_admin")
    : subtitle;
  const isDisabled = disabled || disabledByAdmin;
  // Keep the row floor uniform; Android trims padding slightly (its native
  // controls sit taller). Switch height is capped via SettingSwitch so toggle
  // rows match non-toggle rows.
  const rowSizing =
    Platform.OS === "android" ? "min-h-[42px] py-1.5" : "min-h-[42px] py-2";
  if (onPress)
    return (
      <TouchableOpacity
        disabled={isDisabled}
        onPress={onPress}
        className={`flex flex-row items-center justify-between bg-neutral-900 ${rowSizing} pr-4 pl-4 ${isDisabled ? "opacity-50" : ""}`}
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
      className={`flex flex-row items-center justify-between bg-neutral-900 ${rowSizing} pr-4 pl-4 ${isDisabled ? "opacity-50" : ""}`}
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
        {/* The label sizes to its content and only shrinks if it alone
            overflows; the value column takes whatever is left. That ordering
            matters — the label used to be `flex-1` with a zero basis, so a long
            value (the dev build string, say) collapsed it to an ellipsis, while
            the value itself had no shrink of its own and ran straight past the
            row to be clipped by the screen edge. */}
        <View className='shrink'>
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
          // Values here are diagnostics — build string, token, server URL —
          // that are only useful in full, so wrap rather than truncate. The row
          // has a min height, not a fixed one, so it grows to fit.
          <View className='flex-1 items-end pl-3'>
            <Text selectable className='text-right text-[#9899A1]'>
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
