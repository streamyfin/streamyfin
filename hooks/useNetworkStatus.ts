import NetInfo from "@react-native-community/netinfo";
import { useAtom } from "jotai";
import { useCallback, useEffect, useState } from "react";
import { apiAtom } from "@/providers/JellyfinProvider";

async function checkApiReachable(basePath?: string): Promise<boolean> {
  if (!basePath) return false;
  try {
    const response = await fetch(basePath, { method: "HEAD" });
    return response.ok;
  } catch {
    return false;
  }
}

export function useNetworkStatus() {
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

    // Initial check: wait for NetInfo first
    NetInfo.fetch().then((state) => {
      if (state.isConnected) {
        validateConnection();
      } else {
        setServerConnected(false);
      }
    });

    return () => unsubscribe();
  }, [validateConnection]);

  return { isConnected, serverConnected, loading, retryCheck };
}
