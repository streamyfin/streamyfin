import { apiAtom, getOrSetDeviceId } from "@/providers/JellyfinProvider";
import { getSessionApi } from "@jellyfin/sdk/lib/utils/api";
import { useRouter } from "expo-router";
import { useAtomValue } from "jotai";
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
  useMemo,
  useCallback,
} from "react";
import { AppState, type AppStateStatus } from "react-native";

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
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const router = useRouter();
  const deviceId = useMemo(() => {
    return getOrSetDeviceId();
  }, []);

  const connectWebSocket = useCallback(() => {
    if (!deviceId || !api?.accessToken) {
      return;
    }

    const protocol = api.basePath.includes("https") ? "wss" : "ws";
    const url = `${protocol}://${api.basePath
      .replace("https://", "")
      .replace("http://", "")}/socket?api_key=${
      api.accessToken
    }&deviceId=${deviceId}`;

    const newWebSocket = new WebSocket(url);
    let keepAliveInterval: number | null = null;

    newWebSocket.onopen = () => {
      console.log("WebSocket connection opened");
      setIsConnected(true);
      keepAliveInterval = setInterval(() => {
        if (newWebSocket.readyState === WebSocket.OPEN) {
          newWebSocket.send(JSON.stringify({ MessageType: "KeepAlive" }));
        }
      }, 30000);
    };

    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    const reconnectDelay = 10000;

    newWebSocket.onerror = (e) => {
      console.error("WebSocket error:", e);
      setIsConnected(false);

      if (reconnectAttempts < maxReconnectAttempts) {
        reconnectAttempts++;
        setTimeout(() => {
          console.log(`WebSocket reconnect attempt ${reconnectAttempts}`);
          connectWebSocket();
        }, reconnectDelay);
      } else {
        console.warn("Max WebSocket reconnect attempts reached.");
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
        console.log("[WS] Received message:", message);
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
  }, [api, deviceId]);

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
        console.warn("[WS] Received Play command with no items");
        return;
      }

      const itemId = data.ItemIds[0];
      console.log(`[WS] Handling Play command for item: ${itemId}`);

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
    if (!deviceId || !api || !api?.accessToken) {
      return;
    }

    const init = async () => {
      await getSessionApi(api).postFullCapabilities({
        clientCapabilitiesDto: {
          AppStoreUrl: "https://apps.apple.com/us/app/streamyfin/id6593660679",
          IconUrl:
            "https://raw.githubusercontent.com/retardgerman/streamyfinweb/refs/heads/main/public/assets/images/icon_new_withoutBackground.png",
          PlayableMediaTypes: ["Audio", "Video"],
          SupportedCommands: ["Play"],
          SupportsMediaControl: true,
          SupportsPersistentIdentifier: true,
        },
      });
    };

    init();
  }, [api, deviceId]);

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
      } else {
        console.warn("Cannot send message: WebSocket is not connected");
      }
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
