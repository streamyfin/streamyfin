import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";
import * as Location from "expo-location";
import { useCallback, useEffect, useState } from "react";

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

function extractSSIDFromState(state: NetInfoState): string | null {
  if (state.type === "wifi" && state.details?.ssid) {
    return state.details.ssid;
  }
  return null;
}

export function useWifiSSID(): UseWifiSSIDReturn {
  const [ssid, setSSID] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] =
    useState<PermissionStatus>("undetermined");
  const [isLoading, setIsLoading] = useState(true);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      const newStatus = mapLocationStatus(status);
      setPermissionStatus(newStatus);
      return newStatus === "granted";
    } catch {
      setPermissionStatus("unavailable");
      return false;
    }
  }, []);

  useEffect(() => {
    async function initialize() {
      setIsLoading(true);
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        const mappedStatus = mapLocationStatus(status);
        setPermissionStatus(mappedStatus);

        if (mappedStatus === "granted") {
          const state = await NetInfo.fetch();
          setSSID(extractSSIDFromState(state));
        }
      } catch {
        setPermissionStatus("unavailable");
      }
      setIsLoading(false);
    }

    initialize();
  }, []);

  useEffect(() => {
    if (permissionStatus !== "granted") return;

    // Fetch current state immediately when permission is granted
    NetInfo.fetch().then((state) => {
      console.log(
        "[WiFi Debug] NetInfo state:",
        JSON.stringify(state, null, 2),
      );
      console.log("[WiFi Debug] Permission status:", permissionStatus);
      setSSID(extractSSIDFromState(state));
    });

    const unsubscribe = NetInfo.addEventListener((state) => {
      setSSID(extractSSIDFromState(state));
    });

    return unsubscribe;
  }, [permissionStatus]);

  return {
    ssid,
    permissionStatus,
    requestPermission,
    isLoading,
  };
}
