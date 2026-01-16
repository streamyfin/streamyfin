import { Ionicons } from "@expo/vector-icons";
import React, { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Animated, Easing, Pressable, View } from "react-native";
import { Text } from "@/components/common/Text";
import { Colors } from "@/constants/Colors";
import type { SavedServerAccount } from "@/utils/secureCredentials";

interface TVAccountCardProps {
  account: SavedServerAccount;
  onPress: () => void;
  onLongPress?: () => void;
  hasTVPreferredFocus?: boolean;
}

export const TVAccountCard: React.FC<TVAccountCardProps> = ({
  account,
  onPress,
  onLongPress,
  hasTVPreferredFocus,
}) => {
  const { t } = useTranslation();
  const [isFocused, setIsFocused] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;

  const animateFocus = (focused: boolean) => {
    Animated.parallel([
      Animated.timing(scale, {
        toValue: focused ? 1.03 : 1,
        duration: 150,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(glowOpacity, {
        toValue: focused ? 0.6 : 0,
        duration: 150,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleFocus = () => {
    setIsFocused(true);
    animateFocus(true);
  };

  const handleBlur = () => {
    setIsFocused(false);
    animateFocus(false);
  };

  const getSecurityIcon = (): keyof typeof Ionicons.glyphMap => {
    switch (account.securityType) {
      case "pin":
        return "keypad";
      case "password":
        return "lock-closed";
      default:
        return "key";
    }
  };

  const getSecurityText = (): string => {
    switch (account.securityType) {
      case "pin":
        return t("save_account.pin_code");
      case "password":
        return t("save_account.password");
      default:
        return t("save_account.no_protection");
    }
  };

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      onFocus={handleFocus}
      onBlur={handleBlur}
      hasTVPreferredFocus={hasTVPreferredFocus}
    >
      <Animated.View
        style={[
          {
            transform: [{ scale }],
            shadowColor: "#a855f7",
            shadowOffset: { width: 0, height: 0 },
            shadowRadius: 16,
            elevation: 8,
          },
          { shadowOpacity: glowOpacity },
        ]}
      >
        <View
          style={{
            backgroundColor: isFocused ? "#2a2a2a" : "#262626",
            borderWidth: 2,
            borderColor: isFocused ? "#FFFFFF" : "transparent",
            borderRadius: 16,
            paddingHorizontal: 24,
            paddingVertical: 20,
            flexDirection: "row",
            alignItems: "center",
          }}
        >
          {/* Avatar */}
          <View
            style={{
              width: 56,
              height: 56,
              backgroundColor: "#404040",
              borderRadius: 28,
              alignItems: "center",
              justifyContent: "center",
              marginRight: 20,
            }}
          >
            <Ionicons name='person' size={28} color='white' />
          </View>

          {/* Account Info */}
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 22,
                fontWeight: "600",
                color: "#FFFFFF",
              }}
            >
              {account.username}
            </Text>
            <Text
              style={{
                fontSize: 16,
                color: "#9CA3AF",
                marginTop: 4,
              }}
            >
              {getSecurityText()}
            </Text>
          </View>

          {/* Security Icon */}
          <Ionicons name={getSecurityIcon()} size={24} color={Colors.primary} />
        </View>
      </Animated.View>
    </Pressable>
  );
};
