import { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";
import { getSSID } from "@/modules/wifi-ssid";

export type PermissionStatus =
  | "granted"
  | "denied"
  | "undetermined"
  | "unavailable";

export interface UseWifiSSIDReturn {
  ssid: string | null;
  permissionStatus: PermissionStatus;
  requestPermission: () => Promise<boolean>;
  isLoading: boolean;
}

// WiFi SSID is not available on tvOS
if (Platform.isTV) {
  // Export a stub hook for tvOS
  module.exports = {
    useWifiSSID: (): UseWifiSSIDReturn => ({
      ssid: null,
      permissionStatus: "unavailable" as PermissionStatus,
      requestPermission: async () => false,
      isLoading: false,
    }),
  };
}

// Only import Location on non-TV platforms
const Location = Platform.isTV ? null : require("expo-location");

function mapLocationStatus(status: number | undefined): PermissionStatus {
  if (!Location) return "unavailable";
  switch (status) {
    case Location.PermissionStatus?.GRANTED:
      return "granted";
    case Location.PermissionStatus?.DENIED:
      return "denied";
    default:
      return "undetermined";
  }
}

export function useWifiSSID(): UseWifiSSIDReturn {
  const [ssid, setSSID] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>(
    Platform.isTV ? "unavailable" : "undetermined",
  );
  const [isLoading, setIsLoading] = useState(!Platform.isTV);

  const fetchSSID = useCallback(async () => {
    if (Platform.isTV) return;
    const result = await getSSID();
    setSSID(result);
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (Platform.isTV || !Location) {
      setPermissionStatus("unavailable");
      return false;
    }

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      const newStatus = mapLocationStatus(status);
      setPermissionStatus(newStatus);

      if (newStatus === "granted") {
        await fetchSSID();
      }

      return newStatus === "granted";
    } catch {
      setPermissionStatus("unavailable");
      return false;
    }
  }, [fetchSSID]);

  useEffect(() => {
    if (Platform.isTV || !Location) {
      setIsLoading(false);
      return;
    }

    async function initialize() {
      setIsLoading(true);
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        const mappedStatus = mapLocationStatus(status);
        setPermissionStatus(mappedStatus);

        if (mappedStatus === "granted") {
          await fetchSSID();
        }
      } catch {
        setPermissionStatus("unavailable");
      }
      setIsLoading(false);
    }

    initialize();
  }, [fetchSSID]);

  // Refresh SSID when permission status changes to granted
  useEffect(() => {
    if (Platform.isTV) return;

    if (permissionStatus === "granted") {
      fetchSSID();

      // Also set up an interval to periodically check SSID
      const interval = setInterval(fetchSSID, 10000); // Check every 10 seconds
      return () => clearInterval(interval);
    }
  }, [permissionStatus, fetchSSID]);

  return {
    ssid,
    permissionStatus,
    requestPermission,
    isLoading,
  };
}
