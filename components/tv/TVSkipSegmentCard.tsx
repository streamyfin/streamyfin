import { Ionicons } from "@expo/vector-icons";
import type { FC } from "react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Pressable,
  Animated as RNAnimated,
  StyleSheet,
  TVFocusGuideView,
  type View,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Text } from "@/components/common/Text";
import { scaleSize } from "@/utils/scaleSize";
import { useTVFocusAnimation } from "./hooks/useTVFocusAnimation";

export type TVSkipSegmentType =
  | "intro"
  | "credits"
  | "outro"
  | "recap"
  | "commercial"
  | "preview";

const SEGMENT_LABEL_KEY: Record<TVSkipSegmentType, string> = {
  intro: "player.skip_intro",
  credits: "player.skip_credits",
  outro: "player.skip_outro",
  recap: "player.skip_recap",
  commercial: "player.skip_commercial",
  preview: "player.skip_preview",
};

export interface TVSkipSegmentCardProps {
  show: boolean;
  onPress: () => void;
  type: TVSkipSegmentType;
  /** Whether controls are visible - affects card position */
  controlsVisible?: boolean;
  /** Callback ref setter for focus guide destination pattern */
  refSetter?: (ref: View | null) => void;
  /** Whether this component should receive initial focus */
  hasTVPreferredFocus?: boolean;
  /** Destination used when moving down from this card */
  playButtonRef?: View | null;
}

// Position constants - same as TVNextEpisodeCountdown (they're mutually exclusive)
const BOTTOM_WITH_CONTROLS = 300;
const BOTTOM_WITHOUT_CONTROLS = 120;

export const TVSkipSegmentCard: FC<TVSkipSegmentCardProps> = ({
  show,
  onPress,
  type,
  controlsVisible = false,
  refSetter,
  hasTVPreferredFocus = true,
  playButtonRef: downDestination,
}) => {
  const { t } = useTranslation();
  const { focused, handleFocus, handleBlur, animatedStyle } =
    useTVFocusAnimation({
      scaleAmount: 1.1,
      duration: 120,
    });

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

  const labelText = t(SEGMENT_LABEL_KEY[type]);

  if (!show) return null;

  return (
    <Animated.View
      style={[styles.container, containerAnimatedStyle]}
      pointerEvents='box-none'
    >
      <Pressable
        ref={refSetter}
        onPress={onPress}
        onFocus={handleFocus}
        onBlur={handleBlur}
        hasTVPreferredFocus={hasTVPreferredFocus}
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
          <Ionicons name='play-forward' size={scaleSize(20)} color='#fff' />
          <Text style={styles.label}>{labelText}</Text>
        </RNAnimated.View>
      </Pressable>
      {downDestination && (
        <TVFocusGuideView
          destinations={[downDestination]}
          style={styles.returnFocusGuide}
        />
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    right: scaleSize(80),
    zIndex: 100,
  },
  button: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: scaleSize(10),
    paddingHorizontal: scaleSize(18),
    borderRadius: scaleSize(12),
    borderWidth: scaleSize(2),
    gap: scaleSize(8),
  },
  label: {
    fontSize: scaleSize(20),
    color: "#fff",
    fontWeight: "600",
  },
  returnFocusGuide: {
    height: 1,
    width: "100%",
  },
});
