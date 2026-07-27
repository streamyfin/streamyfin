import type { FC } from "react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useControlsSafeAreaInsets } from "@/hooks/useControlsSafeAreaInsets";
import NextEpisodeCountDownButton from "./NextEpisodeCountDownButton";
import SkipButton from "./SkipButton";

interface Props {
  showSkipButton: boolean;
  showSkipCreditButton: boolean;
  hasContentAfterCredits: boolean;
  willShowNextEpisode: boolean;
  showNextEpisode: boolean;
  autoAdvanceNextEpisode: boolean;
  skipIntro: () => void;
  skipCredit: () => void;
  onNextEpisodeFinish: () => void;
  onNextEpisodePress: () => void;
  controlsVisible: boolean;
  hasChapters?: boolean;
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
const HIDDEN_RIGHT = 24;
const VISIBLE_BOTTOM = 65;
const VISIBLE_RIGHT = 42;
// Extra left shift while the controls show the chapters icon in the bottom
// right corner, so the buttons never crowd it.
const CHAPTERS_CLEARANCE = 10;
const ANIM_DURATION = 250;

// Keeps `value` true for `duration` ms after it turns false. SkipButton hides
// itself instantly via a `hidden` (display:none) class, which would preempt
// the parent's opacity fade-out — lagging the flag keeps the button rendered
// (and visible) while the fade plays out.
const useDelayedHide = (value: boolean, duration: number): boolean => {
  const [display, setDisplay] = useState(value);
  useEffect(() => {
    if (value) {
      setDisplay(true);
      return;
    }
    const t = setTimeout(() => setDisplay(false), duration);
    return () => clearTimeout(t);
  }, [value, duration]);
  return value || display;
};

/**
 * Floating Skip Intro / Skip Credits buttons shown independently of the
 * player controls. They appear on their own during an intro or credits segment
 * without the user having to summon the controls.
 */
export const SkipSegmentOverlay: FC<Props> = ({
  showSkipButton,
  showSkipCreditButton,
  hasContentAfterCredits,
  willShowNextEpisode,
  showNextEpisode,
  autoAdvanceNextEpisode,
  skipIntro,
  skipCredit,
  onNextEpisodeFinish,
  onNextEpisodePress,
  controlsVisible,
  hasChapters,
}) => {
  const insets = useControlsSafeAreaInsets();
  const { t } = useTranslation();

  const showCredit =
    showSkipCreditButton && (hasContentAfterCredits || !willShowNextEpisode);
  const visible = showSkipButton || showCredit || showNextEpisode;

  // Drive each SkipButton with a lagged flag so it stays visible while the
  // opacity fade-out plays, instead of disappearing the instant its segment
  // ends. `visible` above still drives opacity/pointerEvents immediately.
  const renderSkip = useDelayedHide(showSkipButton, ANIM_DURATION);
  const renderCredit = useDelayedHide(showCredit, ANIM_DURATION);

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
  const right =
    insets.right +
    (controlsVisible
      ? VISIBLE_RIGHT + (hasChapters ? CHAPTERS_CLEARANCE : 0)
      : HIDDEN_RIGHT);

  return (
    <Animated.View
      style={[styles.container, { right, bottom }, animatedStyle]}
      pointerEvents={visible ? "box-none" : "none"}
    >
      <SkipButton
        showButton={renderSkip}
        onPress={skipIntro}
        buttonText={t("player.skip_intro")}
      />
      <SkipButton
        showButton={renderCredit}
        onPress={skipCredit}
        buttonText={t("player.skip_credits")}
      />
      {/* Lives here (not in BottomControls) so it shares the skip buttons'
          exact position and can never overlap them. */}
      <NextEpisodeCountDownButton
        show={showNextEpisode}
        autoAdvance={autoAdvanceNextEpisode}
        onFinish={onNextEpisodeFinish}
        onPress={onNextEpisodePress}
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
