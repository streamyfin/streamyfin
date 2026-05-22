import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Animated, Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/common/Text";
import { useScaledTVTypography } from "@/constants/TVTypography";
import { scaleSize } from "@/utils/scaleSize";
import { useTVFocusAnimation } from "./hooks/useTVFocusAnimation";

export interface TVLanguageCardProps {
  code: string;
  name: string;
  selected: boolean;
  hasTVPreferredFocus?: boolean;
  onPress: () => void;
}

export const TVLanguageCard = React.forwardRef<View, TVLanguageCardProps>(
  ({ code, name, selected, hasTVPreferredFocus, onPress }, ref) => {
    const typography = useScaledTVTypography();
    const styles = createStyles(typography);
    const { focused, handleFocus, handleBlur, animatedStyle } =
      useTVFocusAnimation({ scaleAmount: 1.05 });

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
            styles.languageCard,
            animatedStyle,
            {
              backgroundColor: focused
                ? "#fff"
                : selected
                  ? "rgba(255,255,255,0.2)"
                  : "rgba(255,255,255,0.08)",
            },
          ]}
        >
          <Text
            style={[
              styles.languageCardText,
              { color: focused ? "#000" : "#fff" },
              (focused || selected) && { fontWeight: "600" },
            ]}
            numberOfLines={1}
          >
            {name}
          </Text>
          <Text
            style={[
              styles.languageCardCode,
              { color: focused ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.5)" },
            ]}
          >
            {code.toUpperCase()}
          </Text>
          {selected && !focused && (
            <View style={styles.checkmark}>
              <Ionicons
                name='checkmark'
                size={scaleSize(16)}
                color='rgba(255,255,255,0.8)'
              />
            </View>
          )}
        </Animated.View>
      </Pressable>
    );
  },
);

const createStyles = (typography: ReturnType<typeof useScaledTVTypography>) =>
  StyleSheet.create({
    languageCard: {
      width: scaleSize(120),
      height: scaleSize(60),
      borderRadius: scaleSize(12),
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: scaleSize(12),
    },
    languageCardText: {
      fontSize: typography.callout,
      fontWeight: "500",
    },
    languageCardCode: {
      fontSize: typography.callout,
      marginTop: scaleSize(2),
    },
    checkmark: {
      position: "absolute",
      top: scaleSize(8),
      right: scaleSize(8),
    },
  });
