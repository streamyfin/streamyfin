import type { FC } from "react";
import { useEffect } from "react";
import { StyleSheet } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useControlsSafeAreaInsets } from "@/hooks/useControlsSafeAreaInsets";
import SkipButton from "./SkipButton";

interface Props {
  showSkipButton: boolean;
  showSkipCreditButton: boolean;
  hasContentAfterCredits: boolean;
  hasNextItem: boolean;
  skipIntro: () => void;
  skipCredit: () => void;
  controlsVisible: boolean;
}

// Offsets are relative to the safe-area insets so they hold in both portrait
// and landscape (the insets move with the notch / home indicator).
//
// Hidden: low, far-right — nothing else is drawn there, this is the familiar
//         spot and was working fine.
// Visible: shifted up (clear of the horizontal progress bar) and left (clear
//          of the chapters icon), while staying below the vertical volume
//          slider which sits at the vertical middle of the screen.
const HIDDEN_BOTTOM = 24;
const HIDDEN_RIGHT = 12;
const VISIBLE_BOTTOM = 65;
const VISIBLE_RIGHT = 42;
const ANIM_DURATION = 250;

/**
 * Floating Skip Intro / Skip Credits buttons shown independently of the
 * player controls. They appear on their own during an intro or credits segment
 * without the user having to summon the controls.
 */
export const SkipSegmentOverlay: FC<Props> = ({
  showSkipButton,
  showSkipCreditButton,
  hasContentAfterCredits,
  hasNextItem,
  skipIntro,
  skipCredit,
  controlsVisible,
}) => {
  const insets = useControlsSafeAreaInsets();

  const showCredit =
    showSkipCreditButton && (hasContentAfterCredits || !hasNextItem);
  const visible = showSkipButton || showCredit;

  const opacity = useSharedValue(visible ? 1 : 0);

  useEffect(() => {
    opacity.value = withTiming(visible ? 1 : 0, {
      duration: ANIM_DURATION,
      easing: Easing.out(Easing.quad),
    });
  }, [visible, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  // Position is recomputed on render (no slide animation) so the button never
  // sweeps through an overlap zone while the controls toggle.
  const bottom =
    insets.bottom + (controlsVisible ? VISIBLE_BOTTOM : HIDDEN_BOTTOM);
  const right = insets.right + (controlsVisible ? VISIBLE_RIGHT : HIDDEN_RIGHT);

  return (
    <Animated.View
      style={[styles.container, { right, bottom }, animatedStyle]}
      pointerEvents={visible ? "box-none" : "none"}
    >
      <SkipButton
        showButton={showSkipButton}
        onPress={skipIntro}
        buttonText='Skip Intro'
      />
      <SkipButton
        showButton={showCredit}
        onPress={skipCredit}
        buttonText='Skip Credits'
      />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    flexDirection: "row",
    gap: 8,
    zIndex: 15,
  },
});
