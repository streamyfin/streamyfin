import { useFocusEffect } from "expo-router";
import { useCallback, useRef } from "react";
import { useNetworkAwareQueryClient } from "@/hooks/useNetworkAwareQueryClient";

// Query keys that depend on the set of library items. Kept in sync with the
// LibraryChanged handler in WebSocketProvider.
const LIBRARY_QUERY_KEYS = [
  ["home"],
  ["library-items"],
  ["nextUp-all"],
  ["nextUp"],
  ["resumeItems"],
];

/**
 * Fallback refresh for newly added/removed content.
 *
 * The primary path is the server's `LibraryChanged` WebSocket event (handled in
 * WebSocketProvider). This hook is a safety net for cases where the socket was
 * down or the change happened while the screen was unfocused: when the screen
 * regains focus, it invalidates the library-dependent queries so React Query
 * refetches the latest content.
 *
 * Skips the refresh on the very first focus (initial mount already fetches) and
 * throttles to avoid refetch storms when quickly switching tabs.
 */
export function useRefreshLibraryOnFocus(throttleMs = 30_000) {
  const queryClient = useNetworkAwareQueryClient();
  const hasFocusedOnce = useRef(false);
  const lastRefreshRef = useRef(0);

  useFocusEffect(
    useCallback(() => {
      if (!hasFocusedOnce.current) {
        hasFocusedOnce.current = true;
        return;
      }

      const now = Date.now();
      if (now - lastRefreshRef.current < throttleMs) {
        return;
      }
      lastRefreshRef.current = now;

      for (const queryKey of LIBRARY_QUERY_KEYS) {
        queryClient.invalidateQueries({ queryKey });
      }
    }, [queryClient, throttleMs]),
  );
}
