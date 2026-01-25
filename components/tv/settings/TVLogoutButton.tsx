import React from "react";
import { useTranslation } from "react-i18next";
import { Animated, Pressable, View } from "react-native";
import { Text } from "@/components/common/Text";
import { useScaledTVTypography } from "@/constants/TVTypography";
import { useTVFocusAnimation } from "../hooks/useTVFocusAnimation";

export interface TVLogoutButtonProps {
  onPress: () => void;
  disabled?: boolean;
}

export const TVLogoutButton: React.FC<TVLogoutButtonProps> = ({
  onPress,
  disabled,
}) => {
  const { t } = useTranslation();
  const typography = useScaledTVTypography();
  const { focused, handleFocus, handleBlur, animatedStyle } =
    useTVFocusAnimation({ scaleAmount: 1.05 });

  return (
    <Pressable
      onPress={onPress}
      onFocus={handleFocus}
      onBlur={handleBlur}
      disabled={disabled}
      focusable={!disabled}
    >
      <Animated.View
        style={[
          animatedStyle,
          {
            shadowColor: "#ef4444",
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: focused ? 0.6 : 0,
            shadowRadius: focused ? 20 : 0,
          },
        ]}
      >
        <View
          style={{
            backgroundColor: focused ? "#ef4444" : "rgba(239, 68, 68, 0.8)",
            borderRadius: 12,
            paddingVertical: 18,
            paddingHorizontal: 48,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              fontSize: typography.body,
              fontWeight: "bold",
              color: "#FFFFFF",
            }}
          >
            {t("home.settings.log_out_button")}
          </Text>
        </View>
      </Animated.View>
    </Pressable>
  );
};
