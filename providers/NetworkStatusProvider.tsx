import NetInfo from "@react-native-community/netinfo";
import { useAtom } from "jotai";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { apiAtom } from "@/providers/JellyfinProvider";

interface NetworkStatusContextType {
  isConnected: boolean;
  serverConnected: boolean | null;
  loading: boolean;
  retryCheck: () => Promise<void>;
}

const NetworkStatusContext = createContext<NetworkStatusContextType | null>(
  null,
);

async function checkApiReachable(basePath?: string): Promise<boolean> {
  if (!basePath) return false;
  try {
    const url = basePath.endsWith("/") ? basePath : `${basePath}/`;
    const response = await fetch(url, { method: "HEAD" });
    return response.ok;
  } catch {
    return false;
  }
}

export function NetworkStatusProvider({ children }: { children: ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const [serverConnected, setServerConnected] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [api] = useAtom(apiAtom);

  const validateConnection = useCallback(async () => {
    if (!api?.basePath) return false;
    const reachable = await checkApiReachable(api.basePath);
    setServerConnected(reachable);
    return reachable;
  }, [api?.basePath]);

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
