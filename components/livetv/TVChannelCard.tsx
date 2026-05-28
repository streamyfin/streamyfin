import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import React from "react";
import { Animated, Pressable, StyleSheet, View } from "react-native";
import { ServerImage } from "@/components/common/ServerImage";
import { Text } from "@/components/common/Text";
import { useTVFocusAnimation } from "@/components/tv/hooks/useTVFocusAnimation";
import { useScaledTVTypography } from "@/constants/TVTypography";
import { getPrimaryImageUrl } from "@/utils/jellyfin/image/getPrimaryImageUrl";

interface TVChannelCardProps {
  channel: BaseItemDto;
  api: Api | null;
  onPress: () => void;
  hasTVPreferredFocus?: boolean;
  disabled?: boolean;
}

const CARD_WIDTH = 200;
const CARD_HEIGHT = 160;

export const TVChannelCard: React.FC<TVChannelCardProps> = ({
  channel,
  api,
  onPress,
  hasTVPreferredFocus = false,
  disabled = false,
}) => {
  const typography = useScaledTVTypography();
  const { focused, handleFocus, handleBlur, animatedStyle } =
    useTVFocusAnimation({
      scaleAmount: 1.05,
      duration: 120,
    });

  const imageUrl = getPrimaryImageUrl({
    api,
    item: channel,
    quality: 80,
    width: 200,
  });

  return (
    <Pressable
      onPress={onPress}
      onFocus={handleFocus}
      onBlur={handleBlur}
      hasTVPreferredFocus={hasTVPreferredFocus}
      disabled={disabled}
      focusable={!disabled}
      style={styles.pressable}
    >
      <Animated.View
        style={[
          styles.container,
          {
            backgroundColor: focused ? "#FFFFFF" : "rgba(255, 255, 255, 0.08)",
            borderColor: focused ? "#FFFFFF" : "rgba(255, 255, 255, 0.1)",
          },
          animatedStyle,
          focused && styles.focusedShadow,
        ]}
      >
        {/* Channel logo or number */}
        <View style={styles.logoContainer}>
          {imageUrl ? (
            <ServerImage
              uri={imageUrl}
              style={styles.logo}
              contentFit='contain'
            />
          ) : (
            <View
              style={[
                styles.numberFallback,
                {
                  backgroundColor: focused
                    ? "#E5E5E5"
                    : "rgba(255, 255, 255, 0.15)",
                },
              ]}
            >
              <Text
                style={[
                  styles.numberText,
                  {
                    fontSize: typography.title,
                    color: focused ? "#000000" : "#FFFFFF",
                  },
                ]}
              >
                {channel.ChannelNumber || "?"}
              </Text>
            </View>
          )}
        </View>

        {/* Channel name */}
        <Text
          numberOfLines={2}
          style={[
            styles.channelName,
            {
              fontSize: typography.callout,
              color: focused ? "#000000" : "#FFFFFF",
            },
          ]}
        >
          {channel.Name}
        </Text>

        {/* Channel number (if name is shown) */}
        {channel.ChannelNumber && (
          <Text
            numberOfLines={1}
            style={[
              styles.channelNumber,
              {
                fontSize: typography.callout,
                color: focused
                  ? "rgba(0, 0, 0, 0.6)"
                  : "rgba(255, 255, 255, 0.5)",
              },
            ]}
          >
            Ch. {channel.ChannelNumber}
          </Text>
        )}
      </Animated.View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  pressable: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
  },
  container: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  focusedShadow: {
    shadowColor: "#FFFFFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  logoContainer: {
    width: 80,
    height: 60,
    marginBottom: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  logo: {
    width: "100%",
    height: "100%",
  },
  numberFallback: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
  },
  numberText: {
    fontWeight: "bold",
  },
  channelName: {
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 4,
  },
  channelNumber: {
    fontWeight: "400",
  },
});

export { CARD_WIDTH, CARD_HEIGHT };
