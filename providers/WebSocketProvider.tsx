import { getSessionApi } from "@jellyfin/sdk/lib/utils/api";
import { useAtomValue } from "jotai";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState, type AppStateStatus } from "react-native";
import useRouter from "@/hooks/useAppRouter";
import { useNetworkAwareQueryClient } from "@/hooks/useNetworkAwareQueryClient";
import { apiAtom, getOrSetDeviceId } from "@/providers/JellyfinProvider";
import { useNetworkStatus } from "@/providers/NetworkStatusProvider";

// Query keys that depend on the set of library items and should be refreshed
// when the server reports that the library changed (items added/removed/updated).
const LIBRARY_CHANGE_QUERY_KEYS = [
  ["home"],
  ["library-items"],
  ["nextUp-all"],
  ["nextUp"],
  ["resumeItems"],
  ["seasons"],
  ["episodes"],
] as const;

interface WebSocketMessage {
  MessageType: string;
  Data: any;
  // Add other fields as needed
}

interface WebSocketProviderProps {
  children: ReactNode;
}

/**
 * Handler invoked for every message of a given `MessageType`. Receives the
 * message `Data` payload and the full message.
 */
type WebSocketMessageHandler = (data: any, message: WebSocketMessage) => void;

interface WebSocketContextType {
  ws: WebSocket | null;
  isConnected: boolean;
  /**
   * @deprecated Prefer `subscribe`. `lastMessage` only keeps the most recent
   * message, so bursts arriving in the same tick are coalesced and lost. Kept
   * for `useWebsockets` (GeneralCommand handling) until it is migrated.
   */
  lastMessage: WebSocketMessage | null;
  /**
   * Subscribe to a given message type. The handler is called synchronously for
   * every matching message (no coalescing, unlike `lastMessage`). Returns an
   * unsubscribe function to call on cleanup.
   */
  subscribe: (
    messageType: string,
    handler: WebSocketMessageHandler,
  ) => () => void;
  sendMessage: (message: any) => void;
  clearLastMessage: () => void;
}

const WebSocketContext = createContext<WebSocketContextType | null>(null);

export const WebSocketProvider = ({ children }: WebSocketProviderProps) => {
  const api = useAtomValue(apiAtom);
  const { isConnected: isNetworkConnected } = useNetworkStatus();
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const router = useRouter();
  const queryClient = useNetworkAwareQueryClient();
  const deviceId = useMemo(() => {
    return getOrSetDeviceId();
  }, []);
  const reconnectAttemptsRef = useRef(0);
  const libraryChangeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  // Pub/sub registry: messageType -> set of handlers. Stored in a ref so
  // subscribing/dispatching never triggers a re-render.
  const listenersRef = useRef<Map<string, Set<WebSocketMessageHandler>>>(
    new Map(),
  );

  const subscribe = useCallback(
    (messageType: string, handler: WebSocketMessageHandler) => {
      const listeners = listenersRef.current;
      let handlers = listeners.get(messageType);
      if (!handlers) {
        handlers = new Set();
        listeners.set(messageType, handlers);
      }
      handlers.add(handler);
      return () => {
        handlers?.delete(handler);
        if (handlers && handlers.size === 0) {
          listeners.delete(messageType);
        }
      };
    },
    [],
  );

  const dispatchMessage = useCallback((message: WebSocketMessage) => {
    const handlers = listenersRef.current.get(message.MessageType);
    if (!handlers || handlers.size === 0) return;
    // Copy to tolerate handlers that unsubscribe during dispatch.
    for (const handler of [...handlers]) {
      handler(message.Data, message);
    }
  }, []);

  const connectWebSocket = useCallback(() => {
    if (!deviceId || !api?.accessToken || !isNetworkConnected) {
      return;
    }

    const protocol = api.basePath.includes("https") ? "wss" : "ws";
    const url = `${protocol}://${api.basePath
      .replace("https://", "")
      .replace("http://", "")}/socket?api_key=${
      api.accessToken
    }&deviceId=${deviceId}`;

    const newWebSocket = new WebSocket(url);
    let keepAliveInterval: ReturnType<typeof setInterval> | null = null;

    const maxReconnectAttempts = 5;
    const reconnectDelay = 10000;

    newWebSocket.onopen = () => {
      setIsConnected(true);
      reconnectAttemptsRef.current = 0;
      keepAliveInterval = setInterval(() => {
        if (newWebSocket.readyState === WebSocket.OPEN) {
          newWebSocket.send(JSON.stringify({ MessageType: "KeepAlive" }));
        }
      }, 30000);
    };

    newWebSocket.onerror = () => {
      // Don't log errors - this is expected when offline or server unreachable
      setIsConnected(false);

      if (reconnectAttemptsRef.current < maxReconnectAttempts) {
        reconnectAttemptsRef.current++;
        setTimeout(() => {
          connectWebSocket();
        }, reconnectDelay);
      }
    };

    newWebSocket.onclose = () => {
      if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
      }
      setIsConnected(false);
    };
    newWebSocket.onmessage = (e) => {
      try {
        const message = JSON.parse(e.data);
        // Legacy single-slot state, still consumed by useWebsockets.
        setLastMessage(message);
        // Pub/sub: deliver to every subscriber without coalescing.
        dispatchMessage(message);
      } catch (error) {
        console.error("Error parsing WebSocket message:", error);
      }
    };
    setWs(newWebSocket);

    return () => {
      if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
      }
      newWebSocket.close();
    };
  }, [api, deviceId, isNetworkConnected, dispatchMessage]);

  const handleLibraryChanged = useCallback(
    (data: any) => {
      // Jellyfin sends LibraryChanged when a scan adds/updates/removes items.
      // Only refresh when something actually changed in the item set.
      const hasChanges =
        (data?.ItemsAdded?.length ?? 0) > 0 ||
        (data?.ItemsRemoved?.length ?? 0) > 0 ||
        (data?.ItemsUpdated?.length ?? 0) > 0 ||
        (data?.FoldersAddedTo?.length ?? 0) > 0 ||
        (data?.FoldersRemovedFrom?.length ?? 0) > 0;

      if (!hasChanges) {
        return;
      }

      // A single scan can emit several LibraryChanged messages in quick
      // succession, so debounce the invalidation to refetch only once.
      if (libraryChangeDebounceRef.current) {
        clearTimeout(libraryChangeDebounceRef.current);
      }
      libraryChangeDebounceRef.current = setTimeout(() => {
        for (const queryKey of LIBRARY_CHANGE_QUERY_KEYS) {
          queryClient.invalidateQueries({ queryKey: [...queryKey] });
        }
      }, 1000);
    },
    [queryClient],
  );

  // Refresh library-dependent queries when the server reports a change.
  useEffect(
    () => subscribe("LibraryChanged", handleLibraryChanged),
    [subscribe, handleLibraryChanged],
  );

  useEffect(() => {
    return () => {
      if (libraryChangeDebounceRef.current) {
        clearTimeout(libraryChangeDebounceRef.current);
      }
    };
  }, []);

  const handlePlayCommand = useCallback(
    (data: any) => {
      if (!data?.ItemIds?.length) {
        return;
      }

      const itemId = data.ItemIds[0];

      router.push({
        pathname: "/(auth)/player/direct-player",
        params: {
          itemId: itemId,
          playCommand: data.PlayCommand || "PlayNow",
          audioIndex: data.AudioStreamIndex?.toString(),
          subtitleIndex: data.SubtitleStreamIndex?.toString(),
          mediaSourceId: data.MediaSourceId || "",
          bitrateValue: "",
          offline: "false",
        },
      });
    },
    [router],
  );

  // Server-initiated "Play me this item" remote command.
  useEffect(
    () => subscribe("Play", handlePlayCommand),
    [subscribe, handlePlayCommand],
  );

  useEffect(() => {
    const cleanup = connectWebSocket();
    return cleanup;
  }, [connectWebSocket]);

  useEffect(() => {
    if (!deviceId || !api?.accessToken || !isNetworkConnected) {
      return;
    }

    const init = async () => {
      try {
        await getSessionApi(api).postFullCapabilities({
          clientCapabilitiesDto: {
            AppStoreUrl:
              "https://apps.apple.com/us/app/streamyfin/id6593660679",
            IconUrl:
              "https://raw.githubusercontent.com/retardgerman/streamyfinweb/refs/heads/main/public/assets/images/icon_new_withoutBackground.png",
            PlayableMediaTypes: ["Audio", "Video"],
            SupportedCommands: ["Play"],
            SupportsMediaControl: true,
            SupportsPersistentIdentifier: true,
          },
        });
      } catch {
        // Silently fail - expected when offline or server unreachable
      }
    };

    init();
  }, [api, deviceId, isNetworkConnected]);

  useEffect(() => {
    const handleAppStateChange = (state: AppStateStatus) => {
      if (state === "background" || state === "inactive") {
        console.log("App moving to background, closing WebSocket...");
        ws?.close();
      } else if (state === "active") {
        console.log("App coming to foreground, reconnecting WebSocket...");
        connectWebSocket();
      }
    };

    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange,
    );

    return () => {
      subscription.remove();
      ws?.close();
    };
  }, [ws, connectWebSocket]);
  const sendMessage = useCallback(
    (message: any) => {
      if (ws && isConnected) {
        ws.send(JSON.stringify(message));
      }
      // Silently fail when not connected - expected when offline
    },
    [ws, isConnected],
  );
  const clearLastMessage = useCallback(() => {
    setLastMessage(null);
  }, []);
  return (
    <WebSocketContext.Provider
      value={{
        ws,
        isConnected,
        lastMessage,
        subscribe,
        sendMessage,
        clearLastMessage,
      }}
    >
      {children}
    </WebSocketContext.Provider>
  );
};

export const useWebSocketContext = (): WebSocketContextType => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error(
      "useWebSocketContext must be used within a WebSocketProvider",
    );
  }
  return context;
};
