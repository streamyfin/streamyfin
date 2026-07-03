import NetInfo from "@react-native-community/netinfo";
import { Platform, requireNativeModule } from "expo-modules-core";

// Only load the native module on iOS
const WifiSsidModule =
  Platform.OS === "ios" ? requireNativeModule("WifiSsid") : null;

/**
 * Get the current WiFi SSID.
 * Returns null if not connected to WiFi.
 *
 * Requires location permission granted on both platforms.
 * iOS additionally requires the com.apple.developer.networking.wifi-info
 * entitlement and Access WiFi Information capability.
 */
export async function getSSID(): Promise<string | null> {
  if (Platform.OS === "android") {
    const state = await NetInfo.fetch("wifi");
    return state.type === "wifi" ? (state.details.ssid ?? null) : null;
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
