import { Ionicons } from "@expo/vector-icons";
import { type FC, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  Pressable,
  Animated as RNAnimated,
  StyleSheet,
  View,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Text } from "@/components/common/Text";
import { useTVFocusAnimation } from "./hooks/useTVFocusAnimation";

export interface TVSkipSegmentCardProps {
  show: boolean;
  onPress: () => void;
  type: "intro" | "credits";
  /** Whether this card should capture focus when visible */
  hasFocus?: boolean;
  /** Whether controls are visible - affects card position */
  controlsVisible?: boolean;
}

// Position constants - same as TVNextEpisodeCountdown (they're mutually exclusive)
const BOTTOM_WITH_CONTROLS = 300;
const BOTTOM_WITHOUT_CONTROLS = 120;

export const TVSkipSegmentCard: FC<TVSkipSegmentCardProps> = ({
  show,
  onPress,
  type,
  hasFocus = false,
  controlsVisible = false,
}) => {
  const { t } = useTranslation();
  const pressableRef = useRef<View>(null);
  const { focused, handleFocus, handleBlur, animatedStyle } =
    useTVFocusAnimation({
      scaleAmount: 1.1,
      duration: 120,
    });

  // Programmatically request focus when card appears with hasFocus=true
  useEffect(() => {
    if (!show || !hasFocus || !pressableRef.current) return;

    const timer = setTimeout(() => {
      // Use setNativeProps to trigger focus update on tvOS
      (pressableRef.current as any)?.setNativeProps?.({
        hasTVPreferredFocus: true,
      });
    }, 50);
    return () => clearTimeout(timer);
  }, [show, hasFocus]);

  // Animated position based on controls visibility
  const bottomPosition = useSharedValue(
    controlsVisible ? BOTTOM_WITH_CONTROLS : BOTTOM_WITHOUT_CONTROLS,
  );

  useEffect(() => {
    const target = controlsVisible
      ? BOTTOM_WITH_CONTROLS
      : BOTTOM_WITHOUT_CONTROLS;
    bottomPosition.value = withTiming(target, {
      duration: 300,
      easing: Easing.out(Easing.quad),
    });
  }, [controlsVisible, bottomPosition]);

  const containerAnimatedStyle = useAnimatedStyle(() => ({
    bottom: bottomPosition.value,
  }));

  const labelText =
    type === "intro" ? t("player.skip_intro") : t("player.skip_credits");

  if (!show) return null;

  return (
    <Animated.View
      style={[styles.container, containerAnimatedStyle]}
      pointerEvents='box-none'
    >
      <Pressable
        ref={pressableRef}
        onPress={onPress}
        onFocus={handleFocus}
        onBlur={handleBlur}
        hasTVPreferredFocus={hasFocus}
      >
        <RNAnimated.View
          style={[
            styles.button,
            animatedStyle,
            {
              backgroundColor: focused
                ? "rgba(255,255,255,0.3)"
                : "rgba(255,255,255,0.1)",
              borderColor: focused
                ? "rgba(255,255,255,0.8)"
                : "rgba(255,255,255,0.2)",
            },
          ]}
        >
          <Ionicons name='play-forward' size={20} color='#fff' />
          <Text style={styles.label}>{labelText}</Text>
        </RNAnimated.View>
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    right: 80,
    zIndex: 100,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 12,
    borderWidth: 2,
    gap: 8,
  },
  label: {
    fontSize: 20,
    color: "#fff",
    fontWeight: "600",
  },
});
