import { Ionicons } from "@expo/vector-icons";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  View,
} from "react-native";
import { Text } from "@/components/common/Text";

interface TVServerCardProps {
  title: string;
  subtitle?: string;
  securityIcon?: keyof typeof Ionicons.glyphMap | null;
  isLoading?: boolean;
  onPress: () => void;
  hasTVPreferredFocus?: boolean;
  disabled?: boolean;
}

export const TVServerCard: React.FC<TVServerCardProps> = ({
  title,
  subtitle,
  securityIcon,
  isLoading,
  onPress,
  hasTVPreferredFocus,
  disabled = false,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;

  const animateFocus = (focused: boolean) => {
    Animated.parallel([
      Animated.timing(scale, {
        toValue: focused ? 1.02 : 1,
        duration: 150,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(glowOpacity, {
        toValue: focused ? 0.7 : 0,
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

  const isDisabled = disabled || isLoading;

  return (
    <Pressable
      onPress={onPress}
      onFocus={handleFocus}
      onBlur={handleBlur}
      disabled={isDisabled}
      focusable={!isDisabled}
      hasTVPreferredFocus={hasTVPreferredFocus && !isDisabled}
    >
      <Animated.View
        style={[
          {
            transform: [{ scale }],
            shadowColor: "#fff",
            shadowOffset: { width: 0, height: 0 },
            shadowRadius: 16,
            elevation: 8,
          },
          { shadowOpacity: glowOpacity },
        ]}
      >
        <View
          style={{
            backgroundColor: isFocused ? "#2a2a2a" : "#1a1a1a",
            borderWidth: 2,
            borderColor: isFocused ? "#FFFFFF" : "transparent",
            borderRadius: 16,
            paddingHorizontal: 24,
            paddingVertical: 20,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 22,
                fontWeight: "600",
                color: "#FFFFFF",
              }}
              numberOfLines={1}
            >
              {title}
            </Text>
            {subtitle && (
              <Text
                style={{
                  fontSize: 16,
                  color: "#9CA3AF",
                  marginTop: 4,
                }}
                numberOfLines={1}
              >
                {subtitle}
              </Text>
            )}
          </View>

          <View style={{ marginLeft: 16 }}>
            {isLoading ? (
              <ActivityIndicator size='small' color='#fff' />
            ) : securityIcon ? (
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Ionicons
                  name={securityIcon}
                  size={20}
                  color='#fff'
                  style={{ marginRight: 8 }}
                />
                <Ionicons
                  name='chevron-forward'
                  size={24}
                  color={isFocused ? "#FFFFFF" : "#6B7280"}
                />
              </View>
            ) : (
              <Ionicons
                name='chevron-forward'
                size={24}
                color={isFocused ? "#FFFFFF" : "#6B7280"}
              />
            )}
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
};
