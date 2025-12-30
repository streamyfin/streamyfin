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

const SERVER_CHECK_TIMEOUT = 5000; // 5 second timeout
const SERVER_CHECK_RETRIES = 2; // Retry twice before marking offline

async function checkApiReachable(basePath?: string): Promise<boolean> {
  if (!basePath) return false;

  for (let attempt = 0; attempt <= SERVER_CHECK_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        SERVER_CHECK_TIMEOUT,
      );

      const response = await fetch(basePath, {
        method: "HEAD",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        return true;
      }
    } catch (error) {
      // Log only on final attempt
      if (attempt === SERVER_CHECK_RETRIES) {
        console.warn(
          `[NetworkStatus] Server check failed after ${SERVER_CHECK_RETRIES + 1} attempts:`,
          error instanceof Error ? error.message : "Unknown error",
        );
      }
      // Small delay before retry
      if (attempt < SERVER_CHECK_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  }

  return false;
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
