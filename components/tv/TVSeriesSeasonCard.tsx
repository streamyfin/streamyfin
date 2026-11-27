import { Ionicons } from "@expo/vector-icons";
import React, { useRef, useState } from "react";
import {
  Animated,
  Easing,
  Pressable,
  View,
  type ViewInstance,
} from "react-native";
import { Image } from "@/components/common/ServerImage";
import { Text } from "@/components/common/Text";
import { useScaledTVSizes } from "@/constants/TVSizes";
import { useScaledTVTypography } from "@/constants/TVTypography";
import { scaleSize } from "@/utils/scaleSize";

export interface TVSeriesSeasonCardProps {
  title: string;
  subtitle?: string;
  imageUrl: string | null;
  onPress: () => void;
  hasTVPreferredFocus?: boolean;
  /** Setter function for the ref (for focus guide destinations) */
  refSetter?: (ref: ViewInstance | null) => void;
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
  const [focused, setFocused] = useState(false);

  // Scale animation for focus
  const scale = useRef(new Animated.Value(1)).current;
  const animateTo = (value: number) =>
    Animated.timing(scale, {
      toValue: value,
      duration: 150,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();

  return (
    <View style={{ width: sizes.posters.poster }}>
      <Pressable
        ref={refSetter}
        onPress={onPress}
        onFocus={() => {
          setFocused(true);
          animateTo(1.05);
        }}
        onBlur={() => {
          setFocused(false);
          animateTo(1);
        }}
        hasTVPreferredFocus={hasTVPreferredFocus}
      >
        <Animated.View
          style={{
            transform: [{ scale }],
            shadowColor: "#ffffff",
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: focused ? 0.3 : 0,
            shadowRadius: focused ? 12 : 0,
          }}
        >
          <View
            style={{
              width: sizes.posters.poster,
              aspectRatio: 10 / 15,
              borderRadius: scaleSize(24),
              overflow: "hidden",
              backgroundColor: "rgba(255,255,255,0.1)",
              borderWidth: scaleSize(2),
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
                  size={scaleSize(56)}
                  color='rgba(255,255,255,0.4)'
                />
              </View>
            )}
          </View>
        </Animated.View>
      </Pressable>

      <View style={{ marginTop: scaleSize(12) }}>
        <Text
          style={{
            fontSize: typography.callout,
            fontWeight: "500",
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
              marginTop: scaleSize(4),
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
