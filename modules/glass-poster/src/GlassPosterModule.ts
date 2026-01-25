import { NativeModule, requireNativeModule } from "expo";
import { Platform } from "react-native";

import type { GlassPosterModuleEvents } from "./GlassPoster.types";

declare class GlassPosterModuleType extends NativeModule<GlassPosterModuleEvents> {
  isGlassEffectAvailable(): boolean;
}

// Only load the native module on tvOS
let GlassPosterNativeModule: GlassPosterModuleType | null = null;

if (Platform.OS === "ios" && Platform.isTV) {
  try {
    GlassPosterNativeModule =
      requireNativeModule<GlassPosterModuleType>("GlassPoster");
  } catch {
    // Module not available, will use fallback
  }
}

/**
 * Check if the native glass effect is available (tvOS 26+)
 */
export function isGlassEffectAvailable(): boolean {
  if (!GlassPosterNativeModule) {
    return false;
  }
  try {
    return GlassPosterNativeModule.isGlassEffectAvailable();
  } catch {
    return false;
  }
}

export default GlassPosterNativeModule;
