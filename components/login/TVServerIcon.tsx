import { LinearGradient } from "expo-linear-gradient";
import React, { useMemo } from "react";
import { Animated, Pressable, View } from "react-native";
import { Text } from "@/components/common/Text";
import { useTVFocusAnimation } from "@/components/tv/hooks/useTVFocusAnimation";
import { useScaledTVTypography } from "@/constants/TVTypography";
import { scaleSize } from "@/utils/scaleSize";

// Sci-fi gradient color pairs (from, to) - cyberpunk/neon vibes
const SERVER_GRADIENTS: [string, string][] = [
  ["#00D4FF", "#0066FF"], // Cyan to Blue
  ["#FF00E5", "#7B00FF"], // Magenta to Purple
  ["#00FF94", "#00B4D8"], // Neon Green to Cyan
  ["#FF6B35", "#F72585"], // Orange to Pink
  ["#4CC9F0", "#7209B7"], // Sky Blue to Violet
  ["#06D6A0", "#118AB2"], // Mint to Ocean Blue
  ["#FFD60A", "#FF006E"], // Yellow to Hot Pink
  ["#8338EC", "#3A86FF"], // Purple to Blue
  ["#FB5607", "#FFBE0B"], // Orange to Gold
  ["#00F5D4", "#00BBF9"], // Aqua to Azure
  ["#F15BB5", "#9B5DE5"], // Pink to Lavender
  ["#00C49A", "#00509D"], // Teal to Navy
  ["#E63946", "#F4A261"], // Red to Peach
  ["#2EC4B6", "#011627"], // Turquoise to Dark Blue
  ["#FF0099", "#493240"], // Hot Pink to Plum
  ["#11998E", "#38EF7D"], // Teal to Lime
  ["#FC466B", "#3F5EFB"], // Pink to Indigo
  ["#C471ED", "#12C2E9"], // Orchid to Sky
  ["#F857A6", "#FF5858"], // Pink to Coral
  ["#00B09B", "#96C93D"], // Emerald to Lime
  ["#7F00FF", "#E100FF"], // Violet to Magenta
  ["#1FA2FF", "#12D8FA"], // Blue to Cyan
  ["#F09819", "#EDDE5D"], // Orange to Yellow
  ["#FF416C", "#FF4B2B"], // Pink to Red Orange
  ["#654EA3", "#EAAFC8"], // Purple to Rose
  ["#00C6FF", "#0072FF"], // Light Blue to Blue
  ["#F7971E", "#FFD200"], // Orange to Gold
  ["#56AB2F", "#A8E063"], // Green to Lime
  ["#DA22FF", "#9733EE"], // Magenta to Purple
  ["#02AAB0", "#00CDAC"], // Teal variations
  ["#ED213A", "#93291E"], // Red to Dark Red
  ["#FDC830", "#F37335"], // Yellow to Orange
  ["#00B4DB", "#0083B0"], // Ocean Blue
  ["#C33764", "#1D2671"], // Berry to Navy
  ["#E55D87", "#5FC3E4"], // Pink to Sky Blue
  ["#403B4A", "#E7E9BB"], // Dark to Cream
  ["#F2709C", "#FF9472"], // Rose to Peach
  ["#1D976C", "#93F9B9"], // Forest to Mint
  ["#CC2B5E", "#753A88"], // Crimson to Purple
  ["#42275A", "#734B6D"], // Plum shades
  ["#BDC3C7", "#2C3E50"], // Silver to Slate
  ["#DE6262", "#FFB88C"], // Salmon to Apricot
  ["#06BEB6", "#48B1BF"], // Teal shades
  ["#EB3349", "#F45C43"], // Red to Orange Red
  ["#DD5E89", "#F7BB97"], // Pink to Tan
  ["#56CCF2", "#2F80ED"], // Sky to Blue
  ["#007991", "#78FFD6"], // Deep Teal to Mint
  ["#C6FFDD", "#FBD786"], // Mint to Yellow
  ["#F953C6", "#B91D73"], // Pink to Magenta
  ["#B24592", "#F15F79"], // Purple to Coral
];

// Generate a consistent gradient index based on URL (deterministic hash)
// Uses cyrb53 hash - fast and good distribution
const getGradientForString = (str: string): [string, string] => {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hash = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  const index = Math.abs(hash) % SERVER_GRADIENTS.length;
  return SERVER_GRADIENTS[index];
};

export interface TVServerIconProps {
  name: string;
  address: string;
  onPress: () => void;
  onLongPress?: () => void;
  hasTVPreferredFocus?: boolean;
  disabled?: boolean;
}

export const TVServerIcon = React.forwardRef<View, TVServerIconProps>(
  (
    {
      name,
      address,
      onPress,
      onLongPress,
      hasTVPreferredFocus,
      disabled = false,
    },
    ref,
  ) => {
    const typography = useScaledTVTypography();
    const { focused, handleFocus, handleBlur, animatedStyle } =
      useTVFocusAnimation();

    // Get the first letter of the server name (or address if no name)
    const displayName = name || address;
    const initial = displayName.charAt(0).toUpperCase();

    // Get a consistent gradient based on the server URL (deterministic)
    // Use address as primary key, fallback to name + displayName for uniqueness
    const hashKey = address || name || displayName;
    const [gradientStart, gradientEnd] = useMemo(
      () => getGradientForString(hashKey),
      [hashKey],
    );

    return (
      <Pressable
        ref={ref}
        onPress={onPress}
        onLongPress={onLongPress}
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
              shadowColor: gradientStart,
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: focused ? 0.7 : 0,
              shadowRadius: focused ? scaleSize(24) : 0,
            },
          ]}
        >
          <View
            style={{
              width: scaleSize(140),
              height: scaleSize(140),
              borderRadius: scaleSize(70),
              overflow: "hidden",
              marginBottom: scaleSize(14),
              borderWidth: focused ? scaleSize(3) : 0,
              borderColor: "#fff",
            }}
          >
            <LinearGradient
              colors={[gradientStart, gradientEnd]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                width: "100%",
                height: "100%",
                justifyContent: "center",
                alignItems: "center",
                opacity: focused ? 1 : 0.85,
              }}
            >
              <Text
                style={{
                  fontSize: scaleSize(48),
                  fontWeight: "bold",
                  color: "#fff",
                  textShadowColor: "rgba(0,0,0,0.3)",
                  textShadowOffset: { width: 0, height: 2 },
                  textShadowRadius: 4,
                }}
              >
                {initial}
              </Text>
            </LinearGradient>
          </View>

          <Text
            style={{
              fontSize: typography.body,
              fontWeight: "600",
              color: focused ? "#fff" : "rgba(255,255,255,0.9)",
              textAlign: "center",
              marginBottom: scaleSize(4),
            }}
            numberOfLines={3}
          >
            {displayName}
          </Text>

          {name && (
            <Text
              style={{
                fontSize: typography.callout,
                color: focused
                  ? "rgba(255,255,255,0.8)"
                  : "rgba(255,255,255,0.5)",
                textAlign: "center",
              }}
              numberOfLines={3}
            >
              {address.replace(/^https?:\/\//, "")}
            </Text>
          )}
        </Animated.View>
      </Pressable>
    );
  },
);
