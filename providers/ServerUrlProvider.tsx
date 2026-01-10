import { useAtomValue } from "jotai";
import type React from "react";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useWifiSSID } from "@/hooks/useWifiSSID";
import { apiAtom, useJellyfin } from "@/providers/JellyfinProvider";
import { storage } from "@/utils/mmkv";
import { getServerLocalConfig } from "@/utils/secureCredentials";

interface ServerUrlContextValue {
  effectiveServerUrl: string | null;
  isUsingLocalUrl: boolean;
  currentSSID: string | null;
}

const ServerUrlContext = createContext<ServerUrlContextValue | null>(null);

const DEBOUNCE_MS = 500;

interface Props {
  children: ReactNode;
}

export function ServerUrlProvider({ children }: Props): React.ReactElement {
  const api = useAtomValue(apiAtom);
  const { switchServerUrl } = useJellyfin();
  const { ssid, permissionStatus } = useWifiSSID();

  const [isUsingLocalUrl, setIsUsingLocalUrl] = useState(false);
  const [effectiveServerUrl, setEffectiveServerUrl] = useState<string | null>(
    null,
  );

  const remoteUrlRef = useRef<string | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSSIDRef = useRef<string | null>(null);

  // Sync remoteUrl from storage when api changes
  useEffect(() => {
    const storedUrl = storage.getString("serverUrl");
    if (storedUrl) {
      remoteUrlRef.current = storedUrl;
    }
    if (api?.basePath && !effectiveServerUrl) {
      setEffectiveServerUrl(api.basePath);
    }
  }, [api?.basePath, effectiveServerUrl]);

  // Debounced SSID change handler
  useEffect(() => {
    if (permissionStatus !== "granted") return;
    if (ssid === lastSSIDRef.current) return;

    lastSSIDRef.current = ssid;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      const remoteUrl = remoteUrlRef.current;
      if (!remoteUrl || !switchServerUrl) return;

      const config = getServerLocalConfig(remoteUrl);
      const shouldUseLocal = Boolean(
        config?.enabled &&
          config.localUrl &&
          ssid !== null &&
          config.homeWifiSSIDs.includes(ssid),
      );

      const targetUrl = shouldUseLocal ? config!.localUrl : remoteUrl;

      switchServerUrl(targetUrl);
      setIsUsingLocalUrl(shouldUseLocal);
      setEffectiveServerUrl(targetUrl);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [ssid, permissionStatus, switchServerUrl]);

  return (
    <ServerUrlContext.Provider
      value={{
        effectiveServerUrl,
        isUsingLocalUrl,
        currentSSID: ssid,
      }}
    >
      {children}
    </ServerUrlContext.Provider>
  );
}

export function useServerUrl(): ServerUrlContextValue {
  const context = useContext(ServerUrlContext);
  if (!context) {
    throw new Error("useServerUrl must be used within ServerUrlProvider");
  }
  return context;
}
