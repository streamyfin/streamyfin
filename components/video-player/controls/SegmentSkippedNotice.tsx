import { BlurView } from "expo-blur";
import type { FC } from "react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Platform, StyleSheet } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Text } from "@/components/common/Text";
import { useScaledTVTypography } from "@/constants/TVTypography";
import { useControlsSafeAreaInsets } from "@/hooks/useControlsSafeAreaInsets";
import type { SegmentType } from "@/hooks/useSegmentSkipper";
import { SEGMENT_SKIPPED_KEY } from "@/utils/segments";

interface Props {
  /** Segment an automatic skip just jumped over, or null. */
  segment: SegmentType | null;
}

const ANIM_DURATION = 200;
// Sits at the top, horizontally centred. The bottom of the player is taken on
// both sides: the title block on the left, the skip pill and countdown on the
// right. The top strip only holds the header icons, which hug the corners.
const TOP_OFFSET = 16;

/**
 * "Intro skipped" style notice, shown briefly after an automatic skip.
 *
 * Without it an auto-skip is silent and reads as the video jumping on its own,
 * which is the complaint every client with this feature eventually gets.
 */
export const SegmentSkippedNotice: FC<Props> = ({ segment }) => {
  const { t } = useTranslation();
  const insets = useControlsSafeAreaInsets();
  const typography = useScaledTVTypography();
  const opacity = useSharedValue(0);
  // The node outlives `segment` by one fade-out, so reading the label from it
  // directly would empty the pill the instant the notice starts disappearing.
  const lastLabel = useRef("");

  const label = segment ? t(SEGMENT_SKIPPED_KEY[segment]) : lastLabel.current;

  // Persist the label for the fade-out in an effect, never during render:
  // React can discard or replay a render, and a stray write from a discarded
  // one would corrupt the label shown as the notice disappears.
  useEffect(() => {
    if (segment) lastLabel.current = t(SEGMENT_SKIPPED_KEY[segment]);
  }, [segment, t]);

  useEffect(() => {
    opacity.value = withTiming(segment ? 1 : 0, {
      duration: ANIM_DURATION,
      easing: Easing.out(Easing.quad),
    });
  }, [segment, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  // Keep the node mounted through the fade-out so the text does not vanish
  // before the animation has played.
  if (!segment && opacity.value === 0) return null;

  return (
    <Animated.View
      pointerEvents='none'
      style={[
        styles.container,
        { top: insets.top + TOP_OFFSET },
        animatedStyle,
      ]}
    >
      {Platform.isTV ? (
        // TV wants a blurred surface and a size that reads from the couch,
        // not the phone's translucent pill.
        <BlurView intensity={80} tint='dark' style={[styles.pill, styles.blur]}>
          <Text style={[styles.label, { fontSize: typography.callout }]}>
            {label}
          </Text>
        </BlurView>
      ) : (
        <Text style={[styles.label, styles.pill, styles.phonePadding]}>
          {label}
        </Text>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 15,
  },
  pill: {
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: Platform.isTV ? "transparent" : "rgba(0,0,0,0.6)",
  },
  blur: {
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  phonePadding: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  label: {
    color: "#FFFFFF",
    fontWeight: "500",
  },
});
