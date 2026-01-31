import type { EventSubscription } from "expo-modules-core";
import { Platform, requireNativeModule } from "expo-modules-core";

interface TvUserProfileModuleEvents {
  onProfileChange: (event: { profileId: string | null }) => void;
}

interface TvUserProfileModuleType {
  getCurrentProfileId(): string | null;
  isProfileSwitchingSupported(): boolean;
  presentUserPicker(): Promise<boolean>;
  addListener<K extends keyof TvUserProfileModuleEvents>(
    eventName: K,
    listener: TvUserProfileModuleEvents[K],
  ): EventSubscription;
}

// Only load the native module on Apple platforms
const TvUserProfileModule: TvUserProfileModuleType | null =
  Platform.OS === "ios"
    ? requireNativeModule<TvUserProfileModuleType>("TvUserProfile")
    : null;

/**
 * Get the current tvOS profile identifier.
 * Returns null on non-tvOS platforms or if no profile is active.
 */
export function getCurrentProfileId(): string | null {
  if (!TvUserProfileModule) {
    return null;
  }

  try {
    return TvUserProfileModule.getCurrentProfileId() ?? null;
  } catch (error) {
    console.error("[TvUserProfile] Error getting profile ID:", error);
    return null;
  }
}

/**
 * Check if tvOS profile switching is supported on this device.
 * Returns true only on tvOS.
 */
export function isProfileSwitchingSupported(): boolean {
  if (!TvUserProfileModule) {
    return false;
  }

  try {
    return TvUserProfileModule.isProfileSwitchingSupported();
  } catch (error) {
    console.error("[TvUserProfile] Error checking profile support:", error);
    return false;
  }
}

/**
 * Subscribe to profile change events.
 * The callback receives the new profile ID (or null if no profile).
 * Returns an unsubscribe function.
 */
export function addProfileChangeListener(
  callback: (profileId: string | null) => void,
): () => void {
  if (!TvUserProfileModule) {
    // Return no-op unsubscribe on unsupported platforms
    return () => {};
  }

  const subscription = TvUserProfileModule.addListener(
    "onProfileChange",
    (event) => {
      callback(event.profileId);
    },
  );

  return () => subscription.remove();
}

/**
 * Present the system user picker panel.
 * Returns true if successful, false otherwise.
 */
export async function presentUserPicker(): Promise<boolean> {
  if (!TvUserProfileModule) {
    return false;
  }

  try {
    return await TvUserProfileModule.presentUserPicker();
  } catch (error) {
    console.error("[TvUserProfile] Error presenting user picker:", error);
    return false;
  }
}

export default {
  getCurrentProfileId,
  isProfileSwitchingSupported,
  addProfileChangeListener,
  presentUserPicker,
};
