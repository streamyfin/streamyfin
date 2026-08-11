import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { useTranslation } from "react-i18next";
import { Animated, Pressable, View } from "react-native";
import { Text } from "@/components/common/Text";
import { useScaledTVTypography } from "@/constants/TVTypography";
import { scaleSize } from "@/utils/scaleSize";
import { useTVFocusAnimation } from "../hooks/useTVFocusAnimation";

export interface TVSettingsOptionButtonProps {
  label: string;
  value: string;
  onPress: () => void;
  isFirst?: boolean;
  disabled?: boolean;
  /**
   * Locked by the Streamyfin plugin. Distinct from `disabled` because the row
   * has to say *why*: an admin-locked setting is dropped on write and overridden
   * on read, so without a visible reason it just looks like a broken control.
   */
  disabledByAdmin?: boolean;
}

export const TVSettingsOptionButton: React.FC<TVSettingsOptionButtonProps> = ({
  label,
  value,
  onPress,
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
      onPress={onPress}
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
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text
            style={{
              fontSize: typography.callout,
              color: "#9CA3AF",
              marginRight: scaleSize(12),
            }}
          >
            {value}
          </Text>
          <Ionicons
            name='chevron-forward'
            size={scaleSize(20)}
            color='#6B7280'
          />
        </View>
      </Animated.View>
    </Pressable>
  );
};
