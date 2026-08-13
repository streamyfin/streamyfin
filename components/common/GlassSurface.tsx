import { BlurView } from "expo-blur";
import {
  GlassView,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from "expo-glass-effect";
import type { ViewProps } from "react-native";

// Both checks are build/system constants, so resolve once at module load.
// isGlassEffectAPIAvailable guards iOS 26 betas that ship without the API.
const useLiquidGlass = isLiquidGlassAvailable() && isGlassEffectAPIAvailable();

/**
 * Glass surface with graceful degradation: native Liquid Glass on iOS 26+,
 * BlurView below that. expo-glass-effect's GlassView renders a plain View on
 * unsupported systems, so the fallback keeps the translucent look the old
 * react-native-glass-effect-view provided there.
 *
 * Callers keep their platform gates (all current usages are iOS-phone only).
 */
export const GlassSurface: React.FC<ViewProps> = ({
  children,
  style,
  ...props
}) => {
  if (useLiquidGlass) {
    return (
      <GlassView style={style} {...props}>
        {children}
      </GlassView>
    );
  }

  return (
    <BlurView
      intensity={50}
      tint='default'
      style={[{ overflow: "hidden" }, style]}
      {...props}
    >
      {children}
    </BlurView>
  );
};
