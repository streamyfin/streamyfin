import type { EventSubscription } from "expo-modules-core";
import { Platform, requireNativeModule } from "expo-modules-core";

export type SystemVolumeChangeEvent = {
  /** Output volume in the 0..1 range. */
  volume: number;
};

type SystemVolumeNativeModule = {
  getVolume(): number;
  getVolumeAsync(): Promise<number>;
  isVolumeFixed(): boolean;
  setVolume(volume: number): Promise<void> | void;
  setVolumeIndicatorHidden(hidden: boolean): Promise<void>;
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
 * `getSystemVolume`, read off the JS thread. On iOS the read is a round trip to
 * the audio server that can take seconds, so a handler that reads the volume
 * to change it uses this one.
 */
export const getSystemVolumeAsync = async (): Promise<number> => {
  if (!SystemVolumeModule) return 1;
  try {
    return await SystemVolumeModule.getVolumeAsync();
  } catch (error) {
    console.warn("[SystemVolume] getVolumeAsync failed:", error);
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

/**
 * Sets the output volume, in the 0..1 range. No system indicator on Android;
 * on iOS one shows unless `hideSystemVolumeIndicator` holds it back. Does
 * nothing on tvOS, where the TV or the receiver owns the volume.
 */
export const setSystemVolume = (volume: number): void => {
  if (!SystemVolumeModule) return;
  try {
    const pending = SystemVolumeModule.setVolume(
      Math.min(1, Math.max(0, volume)),
    );
    pending?.catch((error) =>
      console.warn("[SystemVolume] setVolume failed:", error),
    );
  } catch (error) {
    console.warn("[SystemVolume] setVolume failed:", error);
  }
};

let indicatorHolds = 0;

const applyIndicatorHidden = (hidden: boolean) =>
  SystemVolumeModule?.setVolumeIndicatorHidden(hidden).catch((error) =>
    console.warn("[SystemVolume] setVolumeIndicatorHidden failed:", error),
  );

/**
 * Keeps the system volume indicator off the screen, for a screen that shows
 * its own volume slider, until the returned function is called. The volume
 * keys still change the volume. Holds nest: the indicator comes back when the
 * last one is released, so a gesture ending does not bring it back over a
 * slider that is still on screen.
 */
export const hideSystemVolumeIndicator = (): (() => void) => {
  if (!SystemVolumeModule) return () => {};
  indicatorHolds += 1;
  if (indicatorHolds === 1) applyIndicatorHidden(true);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    indicatorHolds -= 1;
    if (indicatorHolds === 0) applyIndicatorHidden(false);
  };
};
