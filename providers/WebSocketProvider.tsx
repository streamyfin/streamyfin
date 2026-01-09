import { getSessionApi } from "@jellyfin/sdk/lib/utils/api";
import { useRouter } from "expo-router";
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
import { apiAtom, getOrSetDeviceId } from "@/providers/JellyfinProvider";
import { useNetworkStatus } from "@/providers/NetworkStatusProvider";

interface WebSocketMessage {
  MessageType: string;
  Data: any;
  // Add other fields as needed
}

interface WebSocketProviderProps {
  children: ReactNode;
}

interface WebSocketContextType {
  ws: WebSocket | null;
  isConnected: boolean;
  lastMessage: WebSocketMessage | null;
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
  const deviceId = useMemo(() => {
    return getOrSetDeviceId();
  }, []);
  const reconnectAttemptsRef = useRef(0);

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
      console.log("WebSocket connection opened");
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
        setLastMessage(message); // Store the last message in context
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
  }, [api, deviceId, isNetworkConnected]);

  useEffect(() => {
    if (!lastMessage) {
      return;
    }
    if (lastMessage.MessageType === "Play") {
      handlePlayCommand(lastMessage.Data);
    }
  }, [lastMessage, router]);

  const handlePlayCommand = useCallback(
    (data: any) => {
      if (!data || !data.ItemIds || !data.ItemIds.length) {
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

  useEffect(() => {
    const cleanup = connectWebSocket();
    return cleanup;
  }, [connectWebSocket]);

  useEffect(() => {
    if (!deviceId || !api || !api?.accessToken || !isNetworkConnected) {
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
      value={{ ws, isConnected, lastMessage, sendMessage, clearLastMessage }}
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
