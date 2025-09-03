import NetInfo from "@react-native-community/netinfo";
import { useCallback, useEffect, useState } from "react";

export function useNetworkStatus() {
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(false);

  // Manual check (optional)
  const retryCheck = useCallback(async () => {
    setLoading(true);
    const state = await NetInfo.fetch();
    setIsConnected(!!state.isConnected && !!state.isInternetReachable);
    setLoading(false);
  }, []);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsConnected(!!state.isConnected && !!state.isInternetReachable);
    });

    // Initial state
    NetInfo.fetch().then((state) => {
      setIsConnected(!!state.isConnected && !!state.isInternetReachable);
    });

    return () => unsubscribe();
  }, []);

  return { isConnected, loading, retryCheck };
}
