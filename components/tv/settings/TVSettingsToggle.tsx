import React from "react";
import { useTranslation } from "react-i18next";
import { Animated, Pressable, View } from "react-native";
import { Text } from "@/components/common/Text";
import { useScaledTVTypography } from "@/constants/TVTypography";
import { scaleSize } from "@/utils/scaleSize";
import { useTVFocusAnimation } from "../hooks/useTVFocusAnimation";

export interface TVSettingsToggleProps {
  label: string;
  value: boolean;
  onToggle: (value: boolean) => void;
  isFirst?: boolean;
  disabled?: boolean;
  /**
   * Locked by the Streamyfin plugin. Distinct from `disabled` because the row
   * has to say *why*: an admin-locked setting is dropped on write and overridden
   * on read, so without a visible reason it just looks like a broken toggle.
   */
  disabledByAdmin?: boolean;
}

export const TVSettingsToggle: React.FC<TVSettingsToggleProps> = ({
  label,
  value,
  onToggle,
  isFirst,
  disabled,
  disabledByAdmin,
}) => {
  const { t } = useTranslation();
  const isDisabled = disabled || disabledByAdmin;
  const typography = useScaledTVTypography();
  const { focused, handleFocus, handleBlur, animatedStyle } =
    useTVFocusAnimation({ scaleAmount: 1.02 });

  return (
    <Pressable
      onPress={() => onToggle(!value)}
      onFocus={handleFocus}
      onBlur={handleBlur}
      hasTVPreferredFocus={isFirst && !isDisabled}
      disabled={isDisabled}
      focusable={!isDisabled}
    >
      <Animated.View
        style={[
          animatedStyle,
          {
            backgroundColor: focused
              ? "rgba(255, 255, 255, 0.15)"
              : "rgba(255, 255, 255, 0.05)",
            borderRadius: scaleSize(12),
            paddingVertical: scaleSize(16),
            paddingHorizontal: scaleSize(24),
            marginBottom: scaleSize(8),
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            opacity: isDisabled ? 0.4 : 1,
          },
        ]}
      >
        <View>
          <Text style={{ fontSize: typography.body, color: "#FFFFFF" }}>
            {label}
          </Text>
          {disabledByAdmin && (
            <Text
              style={{
                fontSize: typography.callout,
                color: "#EF4444",
                marginTop: scaleSize(2),
              }}
            >
              {t("home.settings.disabled_by_admin")}
            </Text>
          )}
        </View>
        <View
          style={{
            width: scaleSize(56),
            height: scaleSize(32),
            borderRadius: scaleSize(16),
            backgroundColor: value ? "#FFFFFF" : "#4B5563",
            justifyContent: "center",
            paddingHorizontal: scaleSize(2),
          }}
        >
          <View
            style={{
              width: scaleSize(28),
              height: scaleSize(28),
              borderRadius: scaleSize(14),
              backgroundColor: value ? "#000000" : "#FFFFFF",
              alignSelf: value ? "flex-end" : "flex-start",
            }}
          />
        </View>
      </Animated.View>
    </Pressable>
  );
};
