import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Animated, Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/common/Text";
import { useTVFocusAnimation } from "./hooks/useTVFocusAnimation";

export interface TVTrackCardProps {
  label: string;
  sublabel?: string;
  selected: boolean;
  hasTVPreferredFocus?: boolean;
  onPress: () => void;
}

export const TVTrackCard = React.forwardRef<View, TVTrackCardProps>(
  ({ label, sublabel, selected, hasTVPreferredFocus, onPress }, ref) => {
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
            styles.trackCard,
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
              styles.trackCardText,
              { color: focused ? "#000" : "#fff" },
              (focused || selected) && { fontWeight: "600" },
            ]}
            numberOfLines={2}
          >
            {label}
          </Text>
          {sublabel && (
            <Text
              style={[
                styles.trackCardSublabel,
                {
                  color: focused ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.5)",
                },
              ]}
              numberOfLines={1}
            >
              {sublabel}
            </Text>
          )}
          {selected && !focused && (
            <View style={styles.checkmark}>
              <Ionicons
                name='checkmark'
                size={16}
                color='rgba(255,255,255,0.8)'
              />
            </View>
          )}
        </Animated.View>
      </Pressable>
    );
  },
);

const styles = StyleSheet.create({
  trackCard: {
    width: 180,
    height: 80,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  trackCardText: {
    fontSize: 16,
    textAlign: "center",
  },
  trackCardSublabel: {
    fontSize: 12,
    marginTop: 2,
  },
  checkmark: {
    position: "absolute",
    top: 8,
    right: 8,
  },
});
