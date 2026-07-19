import type React from "react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Platform } from "react-native";
import { getSSID } from "@/modules/wifi-ssid";

export type PermissionStatus =
  | "granted"
  | "denied"
  | "undetermined"
  | "unavailable";

export interface UseWifiSSIDReturn {
  ssid: string | null;
  connectedToWifi: boolean;
  permissionStatus: PermissionStatus;
  requestPermission: () => Promise<boolean>;
  isLoading: boolean;
}

const WifiSsidContext = createContext<UseWifiSSIDReturn | null>(null);

// WiFi SSID is not available on tvOS, and expo-location isn't needed there.
const Location = Platform.isTV ? null : require("expo-location");

const POLL_INTERVAL_MS = 10_000;

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

interface Props {
  children: ReactNode;
}

/**
 * Single source of truth for the current WiFi SSID and the location permission
 * that gates it. State is shared via context so that granting permission in one
 * place (e.g. the network settings screen) is reflected everywhere else — most
 * importantly ServerUrlProvider, which switches between the local and remote
 * server URLs based on the connected SSID.
 *
 * Previously each consumer created its own useWifiSSID instance with independent
 * state, so the provider never learned that permission had been granted later
 * in the session and reported "not connected to WiFi" forever.
 */
export function WifiSsidProvider({ children }: Props): React.ReactElement {
  const [ssid, setSSID] = useState<string | null>(null);
  const [connectedToWifi, setConnectedToWifi] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>(
    Platform.isTV ? "unavailable" : "undetermined",
  );
  const [isLoading, setIsLoading] = useState(!Platform.isTV);

  const fetchSSID = useCallback(async () => {
    if (Platform.isTV) return;
    const result = await getSSID();
    setSSID(result.ssid);
    setConnectedToWifi(result.connectedToWifi);
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
      return newStatus === "granted";
    } catch {
      setPermissionStatus("unavailable");
      return false;
    }
  }, []);

  // Check the location permission once on mount. The poll effect below takes
  // over fetching the SSID whenever permission becomes "granted".
  useEffect(() => {
    if (Platform.isTV || !Location) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    async function initialize() {
      setIsLoading(true);
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (cancelled) return;
        setPermissionStatus(mapLocationStatus(status));
      } catch {
        if (!cancelled) setPermissionStatus("unavailable");
      }
      if (!cancelled) setIsLoading(false);
    }

    initialize();
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch the SSID immediately, then poll, whenever permission is granted.
  // Because permissionStatus is shared, this also covers the case where
  // permission was granted later (from another consumer) than this provider's
  // mount time — the original root cause of the "not connected to WiFi" bug.
  useEffect(() => {
    if (Platform.isTV || permissionStatus !== "granted") return;

    fetchSSID();
    const interval = setInterval(fetchSSID, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [permissionStatus, fetchSSID]);

  const value = useMemo(
    () => ({
      ssid,
      connectedToWifi,
      permissionStatus,
      requestPermission,
      isLoading,
    }),
    [ssid, connectedToWifi, permissionStatus, requestPermission, isLoading],
  );

  return (
    <WifiSsidContext.Provider value={value}>
      {children}
    </WifiSsidContext.Provider>
  );
}

export function useWifiSsid(): UseWifiSSIDReturn {
  const context = useContext(WifiSsidContext);
  if (!context) {
    throw new Error("useWifiSsid must be used within WifiSsidProvider");
  }
  return context;
}
