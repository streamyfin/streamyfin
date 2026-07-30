import type { EventSubscription } from "expo-modules-core";
import { Platform, requireNativeModule } from "expo-modules-core";

export type SystemVolumeChangeEvent = {
  /** Output volume in the 0..1 range. */
  volume: number;
};

type SystemVolumeNativeModule = {
  getVolume(): number;
  isVolumeFixed(): boolean;
  addListener(
    event: "onVolumeChange",
    listener: (event: SystemVolumeChangeEvent) => void,
  ): EventSubscription;
};

// Loaded on iOS/tvOS and Android/Android TV only. Wrapped so an unlinked module
// degrades to "unsupported" instead of taking the whole bundle down.
const SystemVolumeModule: SystemVolumeNativeModule | null = (() => {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return null;
  try {
    return requireNativeModule<SystemVolumeNativeModule>("SystemVolume");
  } catch {
    return null;
  }
})();

/** False when the native module is missing, e.g. on web or an outdated build. */
export const isSystemVolumeAvailable = (): boolean =>
  SystemVolumeModule !== null;

/**
 * Current output volume in the 0..1 range. Returns 1 when unsupported, so a
 * missing module never reads as "muted".
 */
export const getSystemVolume = (): number => {
  if (!SystemVolumeModule) return 1;
  try {
    return SystemVolumeModule.getVolume();
  } catch (error) {
    console.warn("[SystemVolume] getVolume failed:", error);
    return 1;
  }
};

/**
 * True on devices whose output volume the app cannot follow, typically a TV box
 * wired to an AV receiver. Always false on Apple platforms, which expose no
 * equivalent policy. Callers should fall back to the player mute when true.
 */
export const isSystemVolumeFixed = (): boolean => {
  if (!SystemVolumeModule) return true;
  try {
    return SystemVolumeModule.isVolumeFixed();
  } catch (error) {
    console.warn("[SystemVolume] isVolumeFixed failed:", error);
    return true;
  }
};

export const addSystemVolumeListener = (
  listener: (event: SystemVolumeChangeEvent) => void,
): EventSubscription => {
  if (!SystemVolumeModule) return { remove: () => {} } as EventSubscription;
  return SystemVolumeModule.addListener("onVolumeChange", listener);
};
