import NetInfo from "@react-native-community/netinfo";
import { useQueryClient } from "@tanstack/react-query";
import { useAtom } from "jotai";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { apiAtom } from "@/providers/JellyfinProvider";
import {
  customHeadersVersionAtom,
  getJellyfinHeaders,
} from "@/utils/customHeaders";
import { jellyfinProbe } from "@/utils/serverUrl/probes/jellyfin";

interface NetworkStatusContextType {
  isConnected: boolean;
  serverConnected: boolean | null;
  loading: boolean;
  retryCheck: () => Promise<void>;
}

const NetworkStatusContext = createContext<NetworkStatusContextType | null>(
  null,
);

// Probe the canonical unauthenticated endpoint (/System/Info/Public) instead
// of a HEAD on the server root: subpath reverse proxies, auth-gated web roots
// and HEAD-blocking setups made the root check report the server offline
// while the API worked fine, leaving the home screen empty (#1257).
async function checkApiReachable(basePath?: string): Promise<boolean> {
  if (!basePath) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const outcome = await jellyfinProbe(
      basePath,
      controller.signal,
      getJellyfinHeaders(basePath),
    );
    return outcome.status === "ok";
  } finally {
    clearTimeout(timer);
  }
}

export function NetworkStatusProvider({ children }: { children: ReactNode }) {
  const [isConnected, setIsConnected] = useState(true);
  const [serverConnected, setServerConnected] = useState<boolean | null>(true);
  const [loading, setLoading] = useState(false);
  const [api] = useAtom(apiAtom);
  const [customHeadersVersion] = useAtom(customHeadersVersionAtom);
  const queryClient = useQueryClient();
  const wasServerConnected = useRef<boolean | null>(null);

  // Guards against a stale or overlapping check (e.g. two checks in flight for the
  // same basePath, or the active API URL changing mid-check) overwriting a newer
  // result with an outdated one.
  const validationVersionRef = useRef(0);

  // Invalidate in-flight checks as soon as the active API or custom headers change,
  // rather than waiting for the next validateConnection() call to start — a check
  // using the previous URL/headers can otherwise resolve and win the race first.
  useEffect(() => {
    validationVersionRef.current += 1;
  }, [api, customHeadersVersion]);

  const validateConnection = useCallback(async () => {
    const validationVersion = ++validationVersionRef.current;
    if (!api?.basePath) return false;
    const reachable = await checkApiReachable(api.basePath);
    if (validationVersion === validationVersionRef.current) {
      setServerConnected(reachable);
    }
    return reachable;
    // customHeadersVersion: re-probe with the headers the user just saved.
  }, [api?.basePath, customHeadersVersion]);

  const retryCheck = useCallback(async () => {
    setLoading(true);
    await validateConnection();
    setLoading(false);
  }, [validateConnection]);

  useEffect(() => {
    // Guards against a NetInfo.fetch() promise from this effect run resolving
    // after api/customHeadersVersion changed and this effect was cleaned up: its
    // captured validateConnection() closure would otherwise still probe the stale
    // URL/headers, bump the version counter for itself, and win the race.
    let isActive = true;

    const unsubscribe = NetInfo.addEventListener(async (state) => {
      if (!isActive) return;
      setIsConnected(!!state.isConnected);
      if (state.isConnected) {
        await validateConnection();
      } else {
        validationVersionRef.current += 1;
        setServerConnected(false);
      }
    });

    // Initial check
    NetInfo.fetch().then((state) => {
      if (!isActive) return;
      if (state.isConnected) {
        validateConnection();
      } else {
        validationVersionRef.current += 1;
        setServerConnected(false);
      }
    });

    return () => {
      isActive = false;
      unsubscribe();
    };
  }, [validateConnection]);

  // Refetch active queries when server becomes reachable
  useEffect(() => {
    if (serverConnected && wasServerConnected.current === false) {
      queryClient.refetchQueries({ type: "active" });
    }
    wasServerConnected.current = serverConnected;
  }, [serverConnected, queryClient]);

  return (
    <NetworkStatusContext.Provider
      value={{ isConnected, serverConnected, loading, retryCheck }}
    >
      {children}
    </NetworkStatusContext.Provider>
  );
}

export function useNetworkStatus(): NetworkStatusContextType {
  const context = useContext(NetworkStatusContext);
  if (!context) {
    throw new Error(
      "useNetworkStatus must be used within NetworkStatusProvider",
    );
  }
  return context;
}
