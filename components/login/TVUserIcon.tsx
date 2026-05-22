import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React, { useState } from "react";
import { Animated, Pressable, View } from "react-native";
import { Text } from "@/components/common/Text";
import { useTVFocusAnimation } from "@/components/tv/hooks/useTVFocusAnimation";
import { useScaledTVTypography } from "@/constants/TVTypography";
import { getUserImageUrl } from "@/utils/jellyfin/image/getUserImageUrl";
import { scaleSize } from "@/utils/scaleSize";
import type { AccountSecurityType } from "@/utils/secureCredentials";

export interface TVUserIconProps {
  username: string;
  securityType: AccountSecurityType;
  onPress: () => void;
  hasTVPreferredFocus?: boolean;
  disabled?: boolean;
  serverAddress?: string;
  userId?: string;
  primaryImageTag?: string;
}

export const TVUserIcon = React.forwardRef<View, TVUserIconProps>(
  (
    {
      username,
      securityType,
      onPress,
      hasTVPreferredFocus,
      disabled = false,
      serverAddress,
      userId,
      primaryImageTag,
    },
    ref,
  ) => {
    const typography = useScaledTVTypography();
    const { focused, handleFocus, handleBlur, animatedStyle } =
      useTVFocusAnimation();
    const [imageError, setImageError] = useState(false);

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

    const hasSecurityProtection = securityType !== "none";

    const imageUrl =
      serverAddress && userId && primaryImageTag && !imageError
        ? getUserImageUrl({
            serverAddress,
            userId,
            primaryImageTag,
            width: 280,
          })
        : null;

    return (
      <Pressable
        ref={ref}
        onPress={onPress}
        onFocus={handleFocus}
        onBlur={handleBlur}
        hasTVPreferredFocus={hasTVPreferredFocus && !disabled}
        disabled={disabled}
        focusable={!disabled}
      >
        <Animated.View
          style={[
            animatedStyle,
            {
              alignItems: "center",
              width: scaleSize(160),
              overflow: "visible",
              shadowColor: "#fff",
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: focused ? 0.5 : 0,
              shadowRadius: focused ? scaleSize(16) : 0,
            },
          ]}
        >
          <View style={{ position: "relative" }}>
            <View
              style={{
                width: scaleSize(140),
                height: scaleSize(140),
                borderRadius: scaleSize(70),
                overflow: "hidden",
                backgroundColor: focused
                  ? "rgba(255,255,255,0.2)"
                  : "rgba(255,255,255,0.1)",
                marginBottom: scaleSize(14),
                borderWidth: focused ? scaleSize(3) : 0,
                borderColor: "#fff",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              {imageUrl ? (
                <Image
                  source={{ uri: imageUrl }}
                  style={{ width: scaleSize(140), height: scaleSize(140) }}
                  contentFit='cover'
                  onError={() => setImageError(true)}
                />
              ) : (
                <Ionicons
                  name='person'
                  size={scaleSize(56)}
                  color={
                    focused ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.4)"
                  }
                />
              )}
            </View>

            {/* Security badge */}
            {hasSecurityProtection && (
              <View
                style={{
                  position: "absolute",
                  bottom: scaleSize(10),
                  right: scaleSize(10),
                  width: scaleSize(32),
                  height: scaleSize(32),
                  borderRadius: scaleSize(16),
                  backgroundColor: focused ? "#fff" : "rgba(255,255,255,0.9)",
                  justifyContent: "center",
                  alignItems: "center",
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: scaleSize(2) },
                  shadowOpacity: 0.3,
                  shadowRadius: scaleSize(4),
                }}
              >
                <Ionicons
                  name={getSecurityIcon()}
                  size={scaleSize(16)}
                  color='#000'
                />
              </View>
            )}
          </View>

          <Text
            style={{
              fontSize: typography.body,
              fontWeight: "600",
              color: focused ? "#fff" : "rgba(255,255,255,0.9)",
              textAlign: "center",
            }}
            numberOfLines={2}
          >
            {username}
          </Text>
        </Animated.View>
      </Pressable>
    );
  },
);
