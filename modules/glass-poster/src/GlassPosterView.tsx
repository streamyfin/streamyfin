import { requireNativeView } from "expo";
import * as React from "react";
import { Platform, View } from "react-native";

import type { GlassPosterViewProps } from "./GlassPoster.types";
import { isGlassEffectAvailable } from "./GlassPosterModule";

// Only require the native view on tvOS
let NativeGlassPosterView: React.ComponentType<GlassPosterViewProps> | null =
  null;

if (Platform.OS === "ios" && Platform.isTV) {
  try {
    NativeGlassPosterView =
      requireNativeView<GlassPosterViewProps>("GlassPoster");
  } catch {
    // Module not available
  }
}

/**
 * GlassPosterView - Native SwiftUI glass effect poster for tvOS 26+
 *
 * On tvOS 26+: Renders with native Liquid Glass effect
 * On older tvOS: Renders with subtle glass-like material effect
 * On other platforms: Returns null (use existing poster components)
 */
const GlassPosterView: React.FC<GlassPosterViewProps> = (props) => {
  // Only render on tvOS
  if (!Platform.isTV || Platform.OS !== "ios") {
    return null;
  }

  // Use native view if available
  if (NativeGlassPosterView) {
    return <NativeGlassPosterView {...props} />;
  }

  // Fallback: return empty view (caller should handle this)
  return <View style={props.style} />;
};

export default GlassPosterView;

// Re-export availability check for convenience
export { isGlassEffectAvailable };
