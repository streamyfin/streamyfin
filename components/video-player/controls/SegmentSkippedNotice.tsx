import type { FC } from "react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Text } from "@/components/common/Text";
import { useControlsSafeAreaInsets } from "@/hooks/useControlsSafeAreaInsets";
import type { SegmentType } from "@/hooks/useSegmentSkipper";

interface Props {
  /** Segment an automatic skip just jumped over, or null. */
  segment: SegmentType | null;
  controlsVisible: boolean;
}

const SEGMENT_NAME_KEY: Record<SegmentType, string> = {
  Intro: "player.segment_intro",
  Outro: "player.segment_outro",
  Recap: "player.segment_recap",
  Commercial: "player.segment_commercial",
  Preview: "player.segment_preview",
};

const ANIM_DURATION = 200;
// Mirrors the skip pill's offsets so the two sit on the same line, one against
// each edge, and can never overlap.
const HIDDEN_BOTTOM = 24;
const VISIBLE_BOTTOM = 65;

/**
 * "Intro skipped" style notice, shown briefly after an automatic skip.
 *
 * Without it an auto-skip is silent and reads as the video jumping on its own,
 * which is the complaint every client with this feature eventually gets.
 */
export const SegmentSkippedNotice: FC<Props> = ({
  segment,
  controlsVisible,
}) => {
  const { t } = useTranslation();
  const insets = useControlsSafeAreaInsets();
  const opacity = useSharedValue(0);

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

  const label = segment
    ? t("player.segment_skipped", { segment: t(SEGMENT_NAME_KEY[segment]) })
    : "";

  return (
    <Animated.View
      pointerEvents='none'
      style={[
        styles.container,
        {
          left: insets.left + 24,
          bottom:
            insets.bottom + (controlsVisible ? VISIBLE_BOTTOM : HIDDEN_BOTTOM),
        },
        animatedStyle,
      ]}
    >
      <Text style={styles.label}>{label}</Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
    zIndex: 15,
  },
  label: {
    color: "#FFFFFF",
    fontWeight: "500",
  },
});
