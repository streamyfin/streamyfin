import { useEffect } from "react";
import { useWebSocketContext } from "@/providers/WebSocketProvider";

/**
 * While `active` is true, hold a keep-alive token on the global
 * WebSocket so it is NOT closed when the app moves to
 * background/inactive. Releases automatically when `active` flips
 * false or the component unmounts.
 *
 * Used by the video player while in Picture-in-Picture so SyncPlay
 * commands (and any other server pushes) keep flowing while the OS
 * thinks the app is backgrounded.
 */
export function useKeepWebSocketAlive(active: boolean): void {
  const { acquireKeepAlive } = useWebSocketContext();

  useEffect(() => {
    if (!active) return;
    const release = acquireKeepAlive();
    return release;
  }, [active, acquireKeepAlive]);
}
