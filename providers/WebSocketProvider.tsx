import { getSessionApi } from "@jellyfin/sdk/lib/utils/api";
import { isAxiosError } from "axios";
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
import { useNetworkAwareQueryClient } from "@/hooks/useNetworkAwareQueryClient";
import { apiAtom } from "@/providers/JellyfinProvider";
import { useNetworkStatus } from "@/providers/NetworkStatusProvider";
import { getJellyfinHeaders, hasHeaders } from "@/utils/customHeaders";
import { getOrSetDeviceId } from "@/utils/device";
import { describeHttpResponse } from "@/utils/errors";
import { getWebSocketUrl } from "@/utils/jellyfin/getWebSocketUrl";
import {
  createSocketFailureRecorder,
  reportSocketGiveUp,
} from "@/utils/jellyfin/socketFailure";
import { SocketLifecycle } from "@/utils/jellyfin/socketLifecycle";
import { logAndCaptureError, writeErrorLog } from "@/utils/log";

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

// Query keys that depend on per-user playback state (resume position, played
// status, favorites) and should be refreshed when the server reports a
// `UserDataChanged`. Scoped to the progression-based sections so finishing an
// episode does not pointlessly refetch "recently added" or suggestions.
const USER_DATA_CHANGE_QUERY_KEYS = [
  ["home", "continueAndNextUp"],
  ["home", "resumeItems"],
  ["home", "nextUp-all"],
  ["home", "heroItems"],
  ["resumeItems"],
  ["nextUp-all"],
  ["nextUp"],
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
  /** Native playback owns whether backgrounding leaves its SyncPlay group. */
  retainInBackground: () => () => void;
}

const WebSocketContext = createContext<WebSocketContextType | null>(null);

/** React Native's WebSocket constructor, which also takes request headers. */
type RNWebSocketConstructor = new (
  url: string,
  protocols: string[] | string | undefined,
  options: { headers: Record<string, string> },
) => WebSocket;

export const WebSocketProvider = ({ children }: WebSocketProviderProps) => {
  const api = useAtomValue(apiAtom);
  const { isConnected: isNetworkConnected, serverConnected } =
    useNetworkStatus();
  // The give-up report fires at most once per session: after the first
  // exhaustion the attempt counter stays maxed, so every later foreground/
  // network flip would re-trigger it.
  const reportedSocketGiveUpRef = useRef(false);
  const serverConnectedRef = useRef(serverConnected);
  serverConnectedRef.current = serverConnected;
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [socketLifecycle] = useState(
    () =>
      new SocketLifecycle(
        () => AppState.currentState,
        () => setIsConnected(false),
      ),
  );
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const queryClient = useNetworkAwareQueryClient();
  const deviceId = useMemo(() => {
    return getOrSetDeviceId();
  }, []);
  const reconnectAttemptsRef = useRef(0);
  const libraryChangeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const userDataChangeDebounceRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

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
        // Only drop the map entry if it still points at THIS set. After an
        // unsubscribe + re-subscribe for the same type, a stale second call to
        // this cleanup would otherwise delete the new subscribers' set and
        // silently stop delivering their messages.
        if (
          handlers &&
          handlers.size === 0 &&
          listeners.get(messageType) === handlers
        ) {
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
      // Isolate each handler so one throwing subscriber can't abort the rest
      // (and isn't misreported as a parse failure by the outer onmessage catch).
      try {
        handler(message.Data, message);
      } catch (error) {
        logAndCaptureError("WebSocket message handler threw", error, {
          messageType: message.MessageType,
        });
      }
    }
  }, []);

  const connectWebSocket = useCallback(() => {
    // Cancel any reconnect queued by a previous onerror before opening a new
    // socket, so we never end up with two live sockets — each would double the
    // message fan-out and double-invalidate queries.
    socketLifecycle.cancelReconnect();

    if (
      !deviceId ||
      !api?.accessToken ||
      !isNetworkConnected ||
      !socketLifecycle.canConnect()
    ) {
      return;
    }

    const url = getWebSocketUrl(api.basePath, api.accessToken, deviceId);
    // Not an http(s) base path: go without live updates rather than throw out
    // of this effect, which would unmount every provider below the root. The
    // address stays out of the message, which becomes a Sentry breadcrumb.
    if (!url) {
      writeErrorLog("WebSocket: server address is not an http(s) URL");
      return;
    }

    // React Native's WebSocket takes request headers as a third argument (the
    // DOM typings don't know about it), so a server behind an access gateway
    // can complete the upgrade handshake.
    const customHeaders = getJellyfinHeaders(api.basePath);
    const newWebSocket = hasHeaders(customHeaders)
      ? new (WebSocket as unknown as RNWebSocketConstructor)(url, undefined, {
          headers: customHeaders,
        })
      : new WebSocket(url);
    socketLifecycle.setSocket(newWebSocket);
    let keepAliveInterval: ReturnType<typeof setInterval> | null = null;

    const maxReconnectAttempts = 5;
    const reconnectDelay = 10000;

    newWebSocket.onopen = () => {
      if (!socketLifecycle.isCurrent(newWebSocket)) return;
      setIsConnected(true);
      reconnectAttemptsRef.current = 0;
      socketLifecycle.cancelReconnect();
      keepAliveInterval = setInterval(() => {
        socketLifecycle.sendKeepAlive(newWebSocket);
      }, 30000);
    };

    const failure = createSocketFailureRecorder();

    const scheduleReconnect = () => {
      if (
        !socketLifecycle.isCurrent(newWebSocket) ||
        socketLifecycle.hasPendingReconnect()
      )
        return;
      if (reconnectAttemptsRef.current < maxReconnectAttempts) {
        if (
          socketLifecycle.scheduleReconnect(
            newWebSocket,
            reconnectDelay,
            connectWebSocket,
          )
        )
          reconnectAttemptsRef.current++;
      } else if (
        serverConnectedRef.current === true &&
        !reportedSocketGiveUpRef.current
      ) {
        // All retries burned while the SERVER is reachable (a real probe,
        // not just device connectivity): the server itself is rejecting the
        // socket, which silently kills remote control and live updates
        // until the next app foreground. Reported on the next tick: the
        // close event that follows this one is what brings the reason, and
        // the reason is what keeps every proxy that drops the upgrade from
        // piling onto the real bugs.
        reportedSocketGiveUpRef.current = true;
        setTimeout(() => reportSocketGiveUp(failure.describe()), 0);
      }
    };

    newWebSocket.onerror = (event) => {
      if (!socketLifecycle.isCurrent(newWebSocket)) return;
      // Don't log errors - this is expected when offline or server unreachable
      setIsConnected(false);
      failure.error(event);
      scheduleReconnect();
    };

    newWebSocket.onclose = (event) => {
      if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
      }
      if (!socketLifecycle.isCurrent(newWebSocket)) return;
      setIsConnected(false);
      failure.close(event);
      scheduleReconnect();
    };
    newWebSocket.onmessage = (e) => {
      if (!socketLifecycle.isCurrent(newWebSocket)) return;
      try {
        const message = JSON.parse(e.data);
        // Native PiP/backgrounding can suspend JS interval timers. Respond
        // in the message handler rather than wait for the next heartbeat.
        socketLifecycle.respondToKeepAlive(newWebSocket, message.MessageType);
        // Legacy single-slot state, still consumed by useWebsockets.
        setLastMessage(message);
        // Pub/sub: deliver to every subscriber without coalescing.
        dispatchMessage(message);
      } catch (error) {
        logAndCaptureError("Error parsing WebSocket message", error);
      }
    };
    setWs(newWebSocket);

    return () => {
      if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
      }
      socketLifecycle.closeSocket(newWebSocket);
    };
  }, [api, deviceId, isNetworkConnected, dispatchMessage, socketLifecycle]);

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

  const handleUserDataChanged = useCallback(
    (data: any) => {
      // Jellyfin sends UserDataChanged when playback position, played status
      // or favorites change (e.g. finishing an episode). Only the
      // progression-based home sections care about it.
      if (!((data?.UserDataList?.length ?? 0) > 0)) {
        return;
      }

      // Finishing an item can emit several UserDataChanged messages, so
      // debounce to invalidate the affected sections only once.
      if (userDataChangeDebounceRef.current) {
        clearTimeout(userDataChangeDebounceRef.current);
      }
      userDataChangeDebounceRef.current = setTimeout(() => {
        for (const queryKey of USER_DATA_CHANGE_QUERY_KEYS) {
          queryClient.invalidateQueries({ queryKey: [...queryKey] });
        }
      }, 800);
    },
    [queryClient],
  );

  // Refresh library-dependent queries when the server reports a change.
  useEffect(
    () => subscribe("LibraryChanged", handleLibraryChanged),
    [subscribe, handleLibraryChanged],
  );

  // Refresh "Continue Watching" / "Next Up" when playback state changes.
  useEffect(
    () => subscribe("UserDataChanged", handleUserDataChanged),
    [subscribe, handleUserDataChanged],
  );

  useEffect(() => {
    return () => {
      if (libraryChangeDebounceRef.current) {
        clearTimeout(libraryChangeDebounceRef.current);
      }
      if (userDataChangeDebounceRef.current) {
        clearTimeout(userDataChangeDebounceRef.current);
      }
      socketLifecycle.cancelReconnect();
    };
  }, [socketLifecycle]);

  // The server-initiated "Play me this item" command is handled by
  // NativePlayerProvider (mounted below this provider): it presents the
  // native player when active, and falls back to the JS player route.

  useEffect(() => {
    const cleanup = connectWebSocket();
    return () => {
      cleanup?.();
      // A foreground/error reconnect may have replaced the initial socket.
      // Session/network teardown must close the current one even with a lease.
      socketLifecycle.close();
      setIsConnected(false);
    };
  }, [connectWebSocket, socketLifecycle]);

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
              "https://raw.githubusercontent.com/streamyfin/streamyfin/refs/heads/develop/assets/images/streamyfin-client-badge.png",
            PlayableMediaTypes: ["Audio", "Video"],
            SupportedCommands: ["Play"],
            SupportsMediaControl: true,
            SupportsPersistentIdentifier: true,
          },
        });
      } catch (error) {
        // Connectivity failures are filtered centrally; 401 is routine
        // session expiry (the auth interceptor handles it). What remains is
        // a server rejection that silently breaks remote control — and the
        // response's content type, Server header and the kind of body it
        // came with are what tell Jellyfin's own refusal apart from a proxy
        // that blocks the POST, or turns it into a GET via an http→https
        // redirect (405). The body itself is not sent: describeHttpResponse
        // only quotes a reason it knows to be fixed words, and cuts the two
        // headers down to the product and the media type they name.
        if (isAxiosError(error) && error.response?.status === 401) return;
        if (isAxiosError(error) && error.response?.status === 404) {
          // Jellyfin's own ExceptionMiddleware answers 404 ("Error processing
          // request.", text/plain) when this POST races session registration
          // at start/resume; the session appears moments later and the effect
          // re-posts on the next api/network change. Timing, not an app bug —
          // local log only.
          writeErrorLog(
            "Posting session capabilities failed",
            describeHttpResponse(error),
          );
          return;
        }
        // logAndCaptureError describes the response on the event itself.
        logAndCaptureError("Posting session capabilities failed", error);
      }
    };

    init();
  }, [api, deviceId, isNetworkConnected]);

  useEffect(() => {
    const handleAppStateChange = (state: AppStateStatus) => {
      if (socketLifecycle.onAppState(state)) connectWebSocket();
    };

    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange,
    );

    return () => {
      subscription.remove();
    };
  }, [socketLifecycle, connectWebSocket]);
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
        retainInBackground: socketLifecycle.retainInBackground,
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
