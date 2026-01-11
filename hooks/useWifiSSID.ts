import * as Location from "expo-location";
import { useCallback, useEffect, useState } from "react";
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

function mapLocationStatus(
  status: Location.PermissionStatus,
): PermissionStatus {
  switch (status) {
    case Location.PermissionStatus.GRANTED:
      return "granted";
    case Location.PermissionStatus.DENIED:
      return "denied";
    default:
      return "undetermined";
  }
}

export function useWifiSSID(): UseWifiSSIDReturn {
  const [ssid, setSSID] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] =
    useState<PermissionStatus>("undetermined");
  const [isLoading, setIsLoading] = useState(true);

  const fetchSSID = useCallback(async () => {
    const result = await getSSID();
    console.log("[WiFi Debug] Native module SSID:", result);
    setSSID(result);
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
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
