import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React from "react";
import { Animated, Platform, Pressable, View } from "react-native";
import { Text } from "@/components/common/Text";
import { TVTypography } from "@/constants/TVTypography";
import {
  GlassPosterView,
  isGlassEffectAvailable,
} from "@/modules/glass-poster";
import { useTVFocusAnimation } from "./hooks/useTVFocusAnimation";

export interface TVSeriesSeasonCardProps {
  title: string;
  subtitle?: string;
  imageUrl: string | null;
  onPress: () => void;
  hasTVPreferredFocus?: boolean;
}

export const TVSeriesSeasonCard: React.FC<TVSeriesSeasonCardProps> = ({
  title,
  subtitle,
  imageUrl,
  onPress,
  hasTVPreferredFocus,
}) => {
  const { focused, handleFocus, handleBlur, animatedStyle } =
    useTVFocusAnimation({ scaleAmount: 1.05 });

  // Check if glass effect is available (tvOS 26+)
  const useGlass = Platform.OS === "ios" && isGlassEffectAvailable();

  const renderPoster = () => {
    if (useGlass) {
      return (
        <GlassPosterView
          imageUrl={imageUrl}
          aspectRatio={10 / 15}
          cornerRadius={24}
          progress={0}
          showWatchedIndicator={false}
          isFocused={focused}
          width={210}
          style={{ width: 210, marginBottom: 14 }}
        />
      );
    }

    return (
      <View
        style={{
          width: 210,
          aspectRatio: 10 / 15,
          borderRadius: 24,
          overflow: "hidden",
          backgroundColor: "rgba(255,255,255,0.1)",
          marginBottom: 14,
          borderWidth: focused ? 3 : 0,
          borderColor: "#fff",
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
            <Ionicons name='film' size={56} color='rgba(255,255,255,0.4)' />
          </View>
        )}
      </View>
    );
  };

  return (
    <Pressable
      onPress={onPress}
      onFocus={handleFocus}
      onBlur={handleBlur}
      hasTVPreferredFocus={hasTVPreferredFocus}
    >
      <Animated.View
        style={[
          animatedStyle,
          {
            width: 210,
            shadowColor: "#fff",
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: useGlass ? 0 : focused ? 0.5 : 0,
            shadowRadius: useGlass ? 0 : focused ? 20 : 0,
          },
        ]}
      >
        {renderPoster()}

        <Text
          style={{
            fontSize: TVTypography.body,
            fontWeight: "600",
            color: focused ? "#fff" : "rgba(255,255,255,0.9)",
            textAlign: "center",
            marginBottom: 4,
          }}
          numberOfLines={2}
        >
          {title}
        </Text>

        {subtitle && (
          <Text
            style={{
              fontSize: TVTypography.callout,
              color: focused
                ? "rgba(255,255,255,0.8)"
                : "rgba(255,255,255,0.5)",
              textAlign: "center",
            }}
            numberOfLines={1}
          >
            {subtitle}
          </Text>
        )}
      </Animated.View>
    </Pressable>
  );
};
