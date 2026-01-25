import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Animated, Pressable, View } from "react-native";
import { Text } from "@/components/common/Text";
import { useScaledTVTypography } from "@/constants/TVTypography";
import { useTVFocusAnimation } from "../hooks/useTVFocusAnimation";

export interface TVSettingsStepperProps {
  label: string;
  value: number;
  onDecrease: () => void;
  onIncrease: () => void;
  formatValue?: (value: number) => string;
  isFirst?: boolean;
  disabled?: boolean;
}

export const TVSettingsStepper: React.FC<TVSettingsStepperProps> = ({
  label,
  value,
  onDecrease,
  onIncrease,
  formatValue,
  isFirst,
  disabled,
}) => {
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
        borderRadius: 12,
        paddingVertical: 16,
        paddingHorizontal: 24,
        marginBottom: 8,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <Pressable
        onFocus={labelAnim.handleFocus}
        onBlur={labelAnim.handleBlur}
        hasTVPreferredFocus={isFirst && !disabled}
        disabled={disabled}
        focusable={!disabled}
      >
        <Animated.View style={labelAnim.animatedStyle}>
          <Text style={{ fontSize: typography.body, color: "#FFFFFF" }}>
            {label}
          </Text>
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
                width: 40,
                height: 40,
                borderRadius: 10,
                backgroundColor: minusAnim.focused ? "#FFFFFF" : "#4B5563",
                justifyContent: "center",
                alignItems: "center",
              },
            ]}
          >
            <Ionicons
              name='remove'
              size={24}
              color={minusAnim.focused ? "#000000" : "#FFFFFF"}
            />
          </Animated.View>
        </Pressable>
        <Text
          style={{
            fontSize: typography.callout,
            color: "#FFFFFF",
            minWidth: 60,
            textAlign: "center",
            marginHorizontal: 16,
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
                width: 40,
                height: 40,
                borderRadius: 10,
                backgroundColor: plusAnim.focused ? "#FFFFFF" : "#4B5563",
                justifyContent: "center",
                alignItems: "center",
              },
            ]}
          >
            <Ionicons
              name='add'
              size={24}
              color={plusAnim.focused ? "#000000" : "#FFFFFF"}
            />
          </Animated.View>
        </Pressable>
      </View>
    </View>
  );
};
