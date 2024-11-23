import { useEffect, useState } from "react";
import { Alert } from "react-native";
import { Router, useRouter } from "expo-router";
import { Api } from "@jellyfin/sdk";
import { useAtomValue } from "jotai";
import {
  apiAtom,
  getOrSetDeviceId,
  userAtom,
} from "@/providers/JellyfinProvider";
import { useQuery } from "@tanstack/react-query";

interface UseWebSocketProps {
  isPlaying: boolean;
  pauseVideo: () => void;
  playVideo: () => void;
  stopPlayback: () => void;
  offline?: boolean;
}

export const useWebSocket = ({
  isPlaying,
  pauseVideo,
  playVideo,
  stopPlayback,
  offline = false,
}: UseWebSocketProps) => {
  const router = useRouter();
  const user = useAtomValue(userAtom);
  const api = useAtomValue(apiAtom);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const { data: deviceId } = useQuery({
    queryKey: ["deviceId"],
    queryFn: async () => {
      return await getOrSetDeviceId();
    },
    staleTime: Infinity,
  });

  useEffect(() => {
    if (offline || !deviceId || !api?.accessToken) return;

    const protocol = api?.basePath.includes("https") ? "wss" : "ws";

    const url = `${protocol}://${api?.basePath
      .replace("https://", "")
      .replace("http://", "")}/socket?api_key=${
      api?.accessToken
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

    newWebSocket.onclose = (e) => {
      if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
      }
    };

    setWs(newWebSocket);

    return () => {
      if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
      }
      newWebSocket.close();
    };
  }, [api, deviceId, user, offline]);

  useEffect(() => {
    if (offline || !ws) return;

    ws.onmessage = (e) => {
      const json = JSON.parse(e.data);
      const command = json?.Data?.Command;

      console.log("[WS] ~ ", json);

      if (command === "PlayPause") {
        console.log("Command ~ PlayPause");
        if (isPlaying) pauseVideo();
        else playVideo();
      } else if (command === "Stop") {
        console.log("Command ~ Stop");
        stopPlayback();
        router.canGoBack() && router.back();
      } else if (json?.Data?.Name === "DisplayMessage") {
        console.log("Command ~ DisplayMessage");
        const title = json?.Data?.Arguments?.Header;
        const body = json?.Data?.Arguments?.Text;
        Alert.alert("Message from server: " + title, body);
      }
    };
  }, [ws, stopPlayback, playVideo, pauseVideo, isPlaying, router, offline]);

  return { isConnected };
};
