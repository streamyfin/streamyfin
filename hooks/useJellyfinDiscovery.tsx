import { useCallback, useState } from "react";
import dgram from "react-native-udp";

const JELLYFIN_DISCOVERY_PORT = 7359;
const DISCOVERY_MESSAGE = "Who is JellyfinServer?";

interface ServerInfo {
  address: string;
  port: number;
  serverId?: string;
  serverName?: string;
}

export const useJellyfinDiscovery = () => {
  const [servers, setServers] = useState<ServerInfo[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const startDiscovery = useCallback(() => {
    setIsSearching(true);
    setServers([]);

    const discoveredServers = new Set<string>();
    let discoveryTimeout: NodeJS.Timeout;

    const socket = dgram.createSocket({
      type: "udp4",
      reusePort: true,
      debug: __DEV__,
    });

    socket.on("error", (err) => {
      console.error("Socket error:", err);
      socket.close();
      setIsSearching(false);
    });

    socket.bind(0, () => {
      console.log("UDP socket bound successfully");

      try {
        socket.setBroadcast(true);
        const messageBuffer = new TextEncoder().encode(DISCOVERY_MESSAGE);

        socket.send(
          messageBuffer,
          0,
          messageBuffer.length,
          JELLYFIN_DISCOVERY_PORT,
          "255.255.255.255",
          (err) => {
            if (err) {
              console.error("Failed to send discovery message:", err);
              return;
            }
            console.log("Discovery message sent successfully");
          },
        );

        discoveryTimeout = setTimeout(() => {
          setIsSearching(false);
          socket.close();
        }, 5000);
      } catch (error) {
        console.error("Error during discovery:", error);
        setIsSearching(false);
      }
    });

    socket.on("message", (msg, rinfo: any) => {
      if (discoveredServers.has(rinfo.address)) {
        return;
      }

      try {
        const response = new TextDecoder().decode(msg);
        const serverInfo = JSON.parse(response);
        discoveredServers.add(rinfo.address);

        const newServer: ServerInfo = {
          address: `http://${rinfo.address}:${serverInfo.Port || 8096}`,
          port: serverInfo.Port || 8096,
          serverId: serverInfo.Id,
          serverName: serverInfo.Name,
        };

        setServers((prev) => [...prev, newServer]);
      } catch (error) {
        console.error("Error parsing server response:", error);
      }
    });

    return () => {
      clearTimeout(discoveryTimeout);
      if (isSearching) {
        setIsSearching(false);
      }
      socket.close();
    };
  }, []);

  return {
    servers,
    isSearching,
    startDiscovery,
  };
};
