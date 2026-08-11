import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { useTranslation } from "react-i18next";
import { Animated, Pressable, View } from "react-native";
import { Text } from "@/components/common/Text";
import { useScaledTVTypography } from "@/constants/TVTypography";
import { scaleSize } from "@/utils/scaleSize";
import { useTVFocusAnimation } from "../hooks/useTVFocusAnimation";

export interface TVSettingsStepperProps {
  label: string;
  value: number;
  onDecrease: () => void;
  onIncrease: () => void;
  formatValue?: (value: number) => string;
  isFirst?: boolean;
  disabled?: boolean;
  /** Locked by the Streamyfin plugin; dims the row and says so. */
  disabledByAdmin?: boolean;
}

export const TVSettingsStepper: React.FC<TVSettingsStepperProps> = ({
  label,
  value,
  onDecrease,
  onIncrease,
  formatValue,
  isFirst,
  disabled,
  disabledByAdmin,
}) => {
  const { t } = useTranslation();
  const isDisabled = disabled || disabledByAdmin;
  const typography = useScaledTVTypography();
  const labelAnim = useTVFocusAnimation({ scaleAmount: 1.02 });
  const minusAnim = useTVFocusAnimation({ scaleAmount: 1.1 });
  const plusAnim = useTVFocusAnimation({ scaleAmount: 1.1 });

  const displayValue = formatValue ? formatValue(value) : String(value);

  return (
    <View
      style={{
        backgroundColor:
          labelAnim.focused || minusAnim.focused || plusAnim.focused
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
      }}
    >
      <Pressable
        style={{ flex: 1 }}
        onFocus={labelAnim.handleFocus}
        onBlur={labelAnim.handleBlur}
        hasTVPreferredFocus={isFirst && !isDisabled}
        disabled={isDisabled}
        focusable={!isDisabled}
      >
        <Animated.View style={labelAnim.animatedStyle}>
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
        </Animated.View>
      </Pressable>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Pressable
          onPress={onDecrease}
          onFocus={minusAnim.handleFocus}
          onBlur={minusAnim.handleBlur}
          disabled={disabled}
          focusable={!disabled}
        >
          <Animated.View
            style={[
              minusAnim.animatedStyle,
              {
                width: scaleSize(40),
                height: scaleSize(40),
                borderRadius: scaleSize(10),
                backgroundColor: minusAnim.focused ? "#FFFFFF" : "#4B5563",
                justifyContent: "center",
                alignItems: "center",
              },
            ]}
          >
            <Ionicons
              name='remove'
              size={scaleSize(24)}
              color={minusAnim.focused ? "#000000" : "#FFFFFF"}
            />
          </Animated.View>
        </Pressable>
        <Text
          style={{
            fontSize: typography.callout,
            color: "#FFFFFF",
            minWidth: scaleSize(60),
            textAlign: "center",
            marginHorizontal: scaleSize(16),
          }}
        >
          {displayValue}
        </Text>
        <Pressable
          onPress={onIncrease}
          onFocus={plusAnim.handleFocus}
          onBlur={plusAnim.handleBlur}
          disabled={disabled}
          focusable={!disabled}
        >
          <Animated.View
            style={[
              plusAnim.animatedStyle,
              {
                width: scaleSize(40),
                height: scaleSize(40),
                borderRadius: scaleSize(10),
                backgroundColor: plusAnim.focused ? "#FFFFFF" : "#4B5563",
                justifyContent: "center",
                alignItems: "center",
              },
            ]}
          >
            <Ionicons
              name='add'
              size={scaleSize(24)}
              color={plusAnim.focused ? "#000000" : "#FFFFFF"}
            />
          </Animated.View>
        </Pressable>
      </View>
    </View>
  );
};
