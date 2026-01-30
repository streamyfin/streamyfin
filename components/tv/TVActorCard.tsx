import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React from "react";
import { Animated, Pressable, View } from "react-native";
import { Text } from "@/components/common/Text";
import { useScaledTVTypography } from "@/constants/TVTypography";
import { useTVFocusAnimation } from "./hooks/useTVFocusAnimation";

export interface TVActorCardProps {
  person: {
    Id?: string | null;
    Name?: string | null;
    Role?: string | null;
  };
  apiBasePath?: string;
  onPress: () => void;
  hasTVPreferredFocus?: boolean;
}

export const TVActorCard = React.forwardRef<View, TVActorCardProps>(
  ({ person, apiBasePath, onPress, hasTVPreferredFocus }, ref) => {
    const typography = useScaledTVTypography();
    const { focused, handleFocus, handleBlur, animatedStyle } =
      useTVFocusAnimation();

    const imageUrl = person.Id
      ? `${apiBasePath}/Items/${person.Id}/Images/Primary?fillWidth=280&fillHeight=280&quality=90`
      : null;

    return (
      <Pressable
        ref={ref}
        onPress={onPress}
        onFocus={handleFocus}
        onBlur={handleBlur}
        hasTVPreferredFocus={hasTVPreferredFocus}
      >
        <Animated.View
          style={[
            animatedStyle,
            {
              alignItems: "center",
              width: 160,
              shadowColor: "#fff",
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: focused ? 0.5 : 0,
              shadowRadius: focused ? 16 : 0,
            },
          ]}
        >
          <View
            style={{
              width: 140,
              height: 140,
              borderRadius: 70,
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
                <Ionicons
                  name='person'
                  size={56}
                  color='rgba(255,255,255,0.4)'
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
              marginBottom: 4,
            }}
            numberOfLines={1}
          >
            {person.Name}
          </Text>

          {person.Role && (
            <Text
              style={{
                fontSize: typography.callout,
                color: focused
                  ? "rgba(255,255,255,0.8)"
                  : "rgba(255,255,255,0.5)",
                textAlign: "center",
              }}
              numberOfLines={1}
            >
              {person.Role}
            </Text>
          )}
        </Animated.View>
      </Pressable>
    );
  },
);
