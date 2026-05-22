import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { useTranslation } from "react-i18next";
import { Animated, Pressable, View } from "react-native";
import { Text } from "@/components/common/Text";
import { useScaledTVTypography } from "@/constants/TVTypography";
import { scaleSize } from "@/utils/scaleSize";
import type { AccountSecurityType } from "@/utils/secureCredentials";
import { useTVFocusAnimation } from "./hooks/useTVFocusAnimation";

export interface TVUserCardProps {
  username: string;
  securityType: AccountSecurityType;
  hasTVPreferredFocus?: boolean;
  isCurrent?: boolean;
  onPress: () => void;
}

export const TVUserCard = React.forwardRef<View, TVUserCardProps>(
  (
    {
      username,
      securityType,
      hasTVPreferredFocus = false,
      isCurrent = false,
      onPress,
    },
    ref,
  ) => {
    const { t } = useTranslation();
    const typography = useScaledTVTypography();
    const { focused, handleFocus, handleBlur, animatedStyle } =
      useTVFocusAnimation({ scaleAmount: isCurrent ? 1.02 : 1.05 });

    const getSecurityIcon = (): keyof typeof Ionicons.glyphMap => {
      switch (securityType) {
        case "pin":
          return "keypad";
        case "password":
          return "lock-closed";
        default:
          return "key";
      }
    };

    const getSecurityText = (): string => {
      switch (securityType) {
        case "pin":
          return t("save_account.pin_code");
        case "password":
          return t("save_account.password");
        default:
          return t("save_account.no_protection");
      }
    };

    const getBackgroundColor = () => {
      if (isCurrent) {
        return focused ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.04)";
      }
      return focused ? "#fff" : "rgba(255,255,255,0.08)";
    };

    const getTextColor = () => {
      if (isCurrent) {
        return "rgba(255,255,255,0.4)";
      }
      return focused ? "#000" : "#fff";
    };

    const getSecondaryColor = () => {
      if (isCurrent) {
        return "rgba(255,255,255,0.25)";
      }
      return focused ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.5)";
    };

    return (
      <Pressable
        ref={ref}
        onPress={isCurrent ? undefined : onPress}
        onFocus={handleFocus}
        onBlur={handleBlur}
        hasTVPreferredFocus={hasTVPreferredFocus}
      >
        <Animated.View
          style={[
            animatedStyle,
            {
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: getBackgroundColor(),
              borderRadius: scaleSize(14),
              paddingHorizontal: scaleSize(16),
              paddingVertical: scaleSize(14),
              gap: scaleSize(14),
            },
          ]}
        >
          {/* User Avatar */}
          <View
            style={{
              width: scaleSize(44),
              height: scaleSize(44),
              backgroundColor: isCurrent
                ? "rgba(255,255,255,0.08)"
                : focused
                  ? "rgba(0,0,0,0.1)"
                  : "rgba(255,255,255,0.15)",
              borderRadius: scaleSize(22),
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons
              name='person'
              size={scaleSize(24)}
              color={getTextColor()}
            />
          </View>

          {/* Text column */}
          <View style={{ gap: 4 }}>
            {/* Username */}
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <Text
                style={{
                  fontSize: typography.callout,
                  color: getTextColor(),
                  fontWeight: "600",
                }}
                numberOfLines={1}
              >
                {username}
              </Text>
              {isCurrent && (
                <Text
                  style={{
                    fontSize: typography.callout - 4,
                    color: "rgba(255,255,255,0.3)",
                    fontStyle: "italic",
                  }}
                >
                  ({t("home.settings.switch_user.current")})
                </Text>
              )}
            </View>

            {/* Security indicator */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Ionicons
                name={getSecurityIcon()}
                size={scaleSize(12)}
                color={getSecondaryColor()}
              />
              <Text
                style={{
                  fontSize: typography.callout - 4,
                  color: getSecondaryColor(),
                }}
                numberOfLines={1}
              >
                {getSecurityText()}
              </Text>
            </View>
          </View>
        </Animated.View>
      </Pressable>
    );
  },
);
