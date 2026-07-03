import NetInfo from "@react-native-community/netinfo";
import { Platform, requireNativeModule } from "expo-modules-core";

// Only load the native module on iOS
const WifiSsidModule =
  Platform.OS === "ios" ? requireNativeModule("WifiSsid") : null;

/**
 * Get the current WiFi SSID.
 * Returns null if not connected to WiFi.
 *
 * Requires location permission granted on both platforms (Android also
 * needs device-level location services turned on).
 * iOS additionally requires the com.apple.developer.networking.wifi-info
 * entitlement and Access WiFi Information capability.
 */
export async function getSSID(): Promise<string | null> {
  if (Platform.OS === "android") {
    try {
      const state = await NetInfo.fetch("wifi");
      if (state.type !== "wifi") return null;
      const ssid = state.details.ssid;
      // Android reports this placeholder instead of null when it can't
      // resolve the real SSID (e.g. missing location permission on some
      // OS versions).
      return ssid && ssid !== "<unknown ssid>" ? ssid : null;
    } catch (error) {
      console.error("[WifiSsid] Error getting SSID:", error);
      return null;
    }
  }

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
