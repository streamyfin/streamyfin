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
import { getJellyfinCustomHeadersForUrl } from "@/utils/jellyfin/customHeadersForUrl";
import { optionsWithOptionalHeaders } from "@/utils/optionalHeaders";
import { customHeadersVersionAtom } from "@/utils/secureCredentials";

interface NetworkStatusContextType {
  isConnected: boolean;
  serverConnected: boolean | null;
  loading: boolean;
  retryCheck: () => Promise<void>;
}

const NetworkStatusContext = createContext<NetworkStatusContextType | null>(
  null,
);

async function checkApiReachable(
  basePath?: string,
  headers?: Record<string, string>,
): Promise<boolean> {
  if (!basePath) return false;
  try {
    const url = basePath.endsWith("/") ? basePath : `${basePath}/`;
    const response = await fetch(
      url,
      optionsWithOptionalHeaders({ method: "HEAD" }, headers),
    );
    return response.ok;
  } catch {
    return false;
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

  const validateConnection = useCallback(async () => {
    if (!api?.basePath) return false;
    const headers = getJellyfinCustomHeadersForUrl(api.basePath, api.basePath);
    const reachable = await checkApiReachable(api.basePath, headers);
    setServerConnected(reachable);
    return reachable;
  }, [api?.basePath, customHeadersVersion]);

  const retryCheck = useCallback(async () => {
    setLoading(true);
    await validateConnection();
    setLoading(false);
  }, [validateConnection]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(async (state) => {
      setIsConnected(!!state.isConnected);
      if (state.isConnected) {
        await validateConnection();
      } else {
        setServerConnected(false);
      }
    });

    // Initial check
    NetInfo.fetch().then((state) => {
      if (state.isConnected) {
        validateConnection();
      } else {
        setServerConnected(false);
      }
    });

    return () => unsubscribe();
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
