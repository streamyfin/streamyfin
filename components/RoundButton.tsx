import { BlurView } from "expo-blur";
import type { PropsWithChildren } from "react";
import { Platform, type ViewProps } from "react-native";
import { Pressable } from "react-native-gesture-handler";
import { useHaptic } from "@/hooks/useHaptic";

interface Props extends ViewProps {
  onPress?: () => void;
  background?: boolean;
  size?: "default" | "large";
  hapticFeedback?: boolean;
}

/** Keeps the touch target at 44pt now that the large box is glyph-sized. */
const LARGE_HIT_SLOP = 10;

/**
 * `size="large"` is the header variant: it matches `HeaderButton`'s box exactly
 * — icon at `HEADER_ICON_SIZE` plus the shared `HEADER_BUTTON_INSET` — so
 * item-page header buttons land on the same grid as every other header icon in
 * the app. It used to be a 40pt box around a 22pt glyph, and that lopsided 9pt
 * is what forced each header to compensate with margins of its own.
 *
 * The glyph is always a child (a `HeaderIcon` in headers). There used to be an
 * `icon` prop taking an Ionicons name, but header icons are SF Symbols /
 * Material Symbols now and no caller was left using it.
 */
export const RoundButton: React.FC<PropsWithChildren<Props>> = ({
  background = true,
  onPress,
  children,
  size = "default",
  hapticFeedback = true,
  ...viewProps
}) => {
  const isLarge = size === "large";
  // Large is the header variant: a glyph-sized box matching HeaderButton, with
  // spacing owned by the surrounding HeaderButtonGroup rather than the button.
  const buttonSize = isLarge ? "h-6 w-6" : "h-9 w-9";
  const lightHapticFeedback = useHaptic("light");

  const handlePress = () => {
    if (hapticFeedback) {
      lightHapticFeedback();
    }
    onPress?.();
  };

  // The RNGH Pressable (required for macOS Catalyst headers) handles its press
  // natively, outside RN's responder system — so a parent RN touchable (e.g.
  // TouchableItemRouter around an episode card) would also fire. Claiming the
  // responder restores the "innermost touchable wins" behavior.
  const claimResponder = () => true;

  // Neither iOS nor Android draws a backdrop, so the button is just a sized box
  // around the glyph. The blur fallback below covers any other platform.
  if (Platform.OS === "ios" || Platform.OS === "android" || !background) {
    return (
      <Pressable
        onPress={handlePress}
        onStartShouldSetResponder={claimResponder}
        hitSlop={isLarge ? LARGE_HIT_SLOP : undefined}
        className={`rounded-full ${buttonSize} flex items-center justify-center`}
        {...(viewProps as any)}
      >
        {children}
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={handlePress}
      onStartShouldSetResponder={claimResponder}
      hitSlop={isLarge ? LARGE_HIT_SLOP : undefined}
      {...(viewProps as any)}
    >
      <BlurView
        intensity={90}
        className={`rounded-full overflow-hidden ${buttonSize} flex items-center justify-center`}
      >
        {children}
      </BlurView>
    </Pressable>
  );
};
