import { Platform, requireNativeModule } from "expo-modules-core";
import { Linking } from "react-native";

export interface WifiSsidResult {
  ssid: string | null;
  /**
   * Whether the device is connected to a Wi-Fi network. When true but `ssid` is
   * null, the OS is withholding the network name — on Android this happens when
   * device Location services are off (the SSID is location-sensitive).
   */
  connectedToWifi: boolean;
}

// Load the native module on iOS and Android (not TV/web). Wrapped so a
// missing/unlinked module degrades to null instead of crashing the bundle.
const WifiSsidModule = (() => {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return null;
  try {
    return requireNativeModule("WifiSsid");
  } catch {
    return null;
  }
})();

/**
 * Get the current WiFi SSID and whether the device is on a Wi-Fi network.
 *
 * iOS requirements:
 * - Location permission granted
 * - com.apple.developer.networking.wifi-info entitlement
 *
 * Android requirements:
 * - ACCESS_FINE_LOCATION granted at runtime, and device Location services on
 */
export async function getSSID(): Promise<WifiSsidResult> {
  if (!WifiSsidModule) {
    return { ssid: null, connectedToWifi: false };
  }
  try {
    return normalize(await WifiSsidModule.getSSID());
  } catch (error) {
    console.error("[WifiSsid] Error getting SSID:", error);
    return { ssid: null, connectedToWifi: false };
  }
}

/** Synchronous version (uses the older CNCopyCurrentNetworkInfo API on iOS). */
export function getSSIDSync(): WifiSsidResult {
  if (!WifiSsidModule) {
    return { ssid: null, connectedToWifi: false };
  }
  try {
    return normalize(WifiSsidModule.getSSIDSync());
  } catch (error) {
    console.error("[WifiSsid] Error getting SSID (sync):", error);
    return { ssid: null, connectedToWifi: false };
  }
}

/**
 * Open the system Location settings so the user can enable Location services
 * (required on Android for the OS to reveal the Wi-Fi SSID). Falls back to the
 * app's settings page where there is no dedicated native action (e.g. iOS).
 */
export function openLocationSettings(): void {
  try {
    if (WifiSsidModule?.openLocationSettings) {
      WifiSsidModule.openLocationSettings();
      return;
    }
  } catch (error) {
    console.error("[WifiSsid] Error opening location settings:", error);
  }
  Linking.openSettings();
}

// Both native modules return { ssid, connectedToWifi }. The string branch is a
// defensive fallback in case a build returns the older plain-string shape.
function normalize(result: unknown): WifiSsidResult {
  if (typeof result === "string") {
    const ssid = result || null;
    return { ssid, connectedToWifi: ssid !== null };
  }
  if (result && typeof result === "object") {
    const obj = result as { ssid?: string | null; connectedToWifi?: boolean };
    return {
      ssid: obj.ssid ?? null,
      connectedToWifi: Boolean(obj.connectedToWifi),
    };
  }
  return { ssid: null, connectedToWifi: false };
}
