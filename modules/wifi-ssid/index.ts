import { Platform, requireNativeModule } from "expo-modules-core";

// Only load the native module on iOS
const WifiSsidModule =
  Platform.OS === "ios" ? requireNativeModule("WifiSsid") : null;

/**
 * Get the current WiFi SSID on iOS.
 * Returns null on Android or if not connected to WiFi.
 *
 * Requires:
 * - Location permission granted
 * - com.apple.developer.networking.wifi-info entitlement
 * - Access WiFi Information capability enabled in Apple Developer Portal
 */
export async function getSSID(): Promise<string | null> {
  if (!WifiSsidModule) {
    return null;
  }

  try {
    const ssid = await WifiSsidModule.getSSID();
    return ssid ?? null;
  } catch (error) {
    console.error("[WifiSsid] Error getting SSID:", error);
    return null;
  }
}

/**
 * Synchronous version - uses older CNCopyCurrentNetworkInfo API
 */
export function getSSIDSync(): string | null {
  if (!WifiSsidModule) {
    return null;
  }

  try {
    return WifiSsidModule.getSSIDSync() ?? null;
  } catch (error) {
    console.error("[WifiSsid] Error getting SSID (sync):", error);
    return null;
  }
}
