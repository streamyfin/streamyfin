import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
  useMemo,
  useCallback,
} from "react";
import { Alert, AppState, AppStateStatus } from "react-native";
import { useAtomValue } from "jotai";
import { useQuery } from "@tanstack/react-query";
import {
  apiAtom,
  getOrSetDeviceId,
  userAtom,
} from "@/providers/JellyfinProvider";
import { getSessionApi } from "@jellyfin/sdk/lib/utils/api";
import native from "@/utils/profiles/native";

interface WebSocketProviderProps {
  children: ReactNode;
}

interface WebSocketContextType {
  ws: WebSocket | null;
  isConnected: boolean;
}

const WebSocketContext = createContext<WebSocketContextType | null>(null);

export const WebSocketProvider = ({ children }: WebSocketProviderProps) => {
  const user = useAtomValue(userAtom);
  const api = useAtomValue(apiAtom);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const deviceId = useMemo(() => {
    return getOrSetDeviceId();
  }, []);

  const connectWebSocket = useCallback(() => {
    if (!deviceId || !api?.accessToken) return;

    const protocol = api.basePath.includes("https") ? "wss" : "ws";
    const url = `${protocol}://${api.basePath
      .replace("https://", "")
      .replace("http://", "")}/socket?api_key=${
      api.accessToken
    }&deviceId=${deviceId}`;

    const newWebSocket = new WebSocket(url);
    let keepAliveInterval: NodeJS.Timeout | null = null;

    newWebSocket.onopen = () => {
      setIsConnected(true);
      keepAliveInterval = setInterval(() => {
        if (newWebSocket.readyState === WebSocket.OPEN) {
          newWebSocket.send(JSON.stringify({ MessageType: "KeepAlive" }));
        }
      }, 30000);
    };

    newWebSocket.onerror = (e) => {
      console.error("WebSocket error:", e);
      setIsConnected(false);
    };

    newWebSocket.onclose = () => {
      if (keepAliveInterval) clearInterval(keepAliveInterval);
      setIsConnected(false);
    };

    setWs(newWebSocket);

    return () => {
      if (keepAliveInterval) clearInterval(keepAliveInterval);
      newWebSocket.close();
    };
  }, [api, deviceId]);

  useEffect(() => {
    const cleanup = connectWebSocket();
    return cleanup;
  }, [connectWebSocket]);

  useEffect(() => {
    if (!deviceId || !api || !api?.accessToken) return;

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

  return (
    <WebSocketContext.Provider value={{ ws, isConnected }}>
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
