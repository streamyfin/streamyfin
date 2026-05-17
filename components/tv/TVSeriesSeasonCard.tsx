import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React, { useRef, useState } from "react";
import { Animated, Easing, Platform, Pressable, View } from "react-native";
import { Text } from "@/components/common/Text";
import { useScaledTVSizes, useTVDesignTokens } from "@/constants/TVSizes";
import { useScaledTVTypography } from "@/constants/TVTypography";
import {
  GlassPosterView,
  isGlassEffectAvailable,
} from "@/modules/glass-poster";

export interface TVSeriesSeasonCardProps {
  title: string;
  subtitle?: string;
  imageUrl: string | null;
  onPress: () => void;
  hasTVPreferredFocus?: boolean;
  /** Setter function for the ref (for focus guide destinations) */
  refSetter?: (ref: View | null) => void;
}

export const TVSeriesSeasonCard: React.FC<TVSeriesSeasonCardProps> = ({
  title,
  subtitle,
  imageUrl,
  onPress,
  hasTVPreferredFocus,
  refSetter,
}) => {
  const typography = useScaledTVTypography();
  const sizes = useScaledTVSizes();
  const tv = useTVDesignTokens();
  const [focused, setFocused] = useState(false);

  // Check if glass effect is available (tvOS 26+)
  const useGlass = Platform.OS === "ios" && isGlassEffectAvailable();

  // Scale animation for focus (only used when NOT using glass effect)
  const scale = useRef(new Animated.Value(1)).current;
  const animateTo = (value: number) =>
    Animated.timing(scale, {
      toValue: value,
      duration: 150,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();

  const renderPoster = () => {
    if (useGlass) {
      return (
        <GlassPosterView
          imageUrl={imageUrl}
          aspectRatio={10 / 15}
          cornerRadius={tv.radius.xl}
          progress={0}
          showWatchedIndicator={false}
          isFocused={focused}
          width={sizes.posters.poster}
          style={{ width: sizes.posters.poster }}
        />
      );
    }

    return (
      <View
        style={{
          width: sizes.posters.poster,
          aspectRatio: 10 / 15,
          borderRadius: tv.radius.xl,
          overflow: "hidden",
          backgroundColor: "rgba(255,255,255,0.1)",
          borderWidth: 2,
          borderColor: focused ? "#FFFFFF" : "transparent",
        }}
      >
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={{ width: "100%", height: "100%" }}
            contentFit='cover'
          />
        ) : (
          <View
            style={{
              flex: 1,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Ionicons
              name='film'
              size={tv.size(56)}
              color='rgba(255,255,255,0.4)'
            />
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={{ width: sizes.posters.poster }}>
      <Pressable
        ref={refSetter}
        onPress={onPress}
        onFocus={() => {
          setFocused(true);
          // Only animate scale when not using glass effect (glass handles its own focus visual)
          if (!useGlass) {
            animateTo(1.05);
          }
        }}
        onBlur={() => {
          setFocused(false);
          if (!useGlass) {
            animateTo(1);
          }
        }}
        hasTVPreferredFocus={hasTVPreferredFocus}
      >
        <Animated.View
          style={{
            // Only apply scale transform when not using glass effect
            transform: useGlass ? undefined : [{ scale }],
            // Only apply shadow glow when not using glass (glass has its own glow)
            shadowColor: useGlass ? undefined : "#ffffff",
            shadowOffset: useGlass ? undefined : { width: 0, height: 0 },
            shadowOpacity: useGlass ? undefined : focused ? 0.3 : 0,
            shadowRadius: useGlass ? undefined : focused ? tv.shadow.md : 0,
          }}
        >
          {renderPoster()}
        </Animated.View>
      </Pressable>

      <View style={{ marginTop: tv.spacing.sm }}>
        <Text
          style={{
            fontSize: typography.body,
            color: "#FFFFFF",
          }}
          numberOfLines={2}
        >
          {title}
        </Text>

        {subtitle && (
          <Text
            style={{
              fontSize: typography.callout,
              color: "#9CA3AF",
              marginTop: tv.spacing.xxs,
            }}
            numberOfLines={1}
          >
            {subtitle}
          </Text>
        )}
      </View>
    </View>
  );
};
