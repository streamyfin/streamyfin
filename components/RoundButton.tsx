import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import type { PropsWithChildren } from "react";
import { Platform, type ViewProps } from "react-native";
import { Pressable } from "react-native-gesture-handler";
import { HEADER_ICON_SIZE } from "@/components/common/HeaderButton";
import { useHaptic } from "@/hooks/useHaptic";

interface Props extends ViewProps {
  onPress?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  background?: boolean;
  size?: "default" | "large";
  fillColor?: "primary";
  color?: "white" | "purple";
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
 */
export const RoundButton: React.FC<PropsWithChildren<Props>> = ({
  background = true,
  icon,
  onPress,
  children,
  size = "default",
  fillColor,
  color = "white",
  hapticFeedback = true,
  ...viewProps
}) => {
  const isLarge = size === "large";
  // Large is the header variant: glyph-sized box plus the shared header inset,
  // so it spaces identically to a HeaderButton beside it. Width is left to the
  // content rather than fixed, or the padding would eat into the glyph.
  const buttonSize = isLarge ? "h-6 px-2" : "h-9 w-9";
  const fillColorClass = fillColor === "primary" ? "bg-purple-600" : "";
  const lightHapticFeedback = useHaptic("light");

  const handlePress = () => {
    if (hapticFeedback) {
      lightHapticFeedback();
    }
    onPress?.();
  };

  const content = icon ? (
    <Ionicons
      name={icon}
      size={isLarge ? HEADER_ICON_SIZE : 18}
      color={color === "white" ? "white" : "#9334E9"}
    />
  ) : (
    children
  );

  // Neither iOS nor Android draws a backdrop, so the button is just a sized box
  // around the glyph. The blur fallback below covers any other platform.
  if (Platform.OS === "ios" || Platform.OS === "android" || !background) {
    return (
      <Pressable
        onPress={handlePress}
        hitSlop={isLarge ? LARGE_HIT_SLOP : undefined}
        className={`rounded-full ${buttonSize} flex items-center justify-center ${fillColorClass}`}
        {...(viewProps as any)}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={handlePress}
      hitSlop={isLarge ? LARGE_HIT_SLOP : undefined}
      {...(viewProps as any)}
    >
      <BlurView
        intensity={90}
        className={`rounded-full overflow-hidden ${buttonSize} flex items-center justify-center ${fillColorClass}`}
      >
        {content}
      </BlurView>
    </Pressable>
  );
};
