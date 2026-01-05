import { useAtom } from "jotai";
import type React from "react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { View, type ViewProps } from "react-native";
import { useMMKVString } from "react-native-mmkv";
import { apiAtom, useJellyfin } from "@/providers/JellyfinProvider";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";

interface Server {
  address: string;
  serverName?: string;
  serverId?: string;
  lastUsername?: string;
  savedToken?: string;
}

interface Props extends ViewProps {}

export const ServerSwitcher: React.FC<Props> = ({ ...props }) => {
  const [_previousServers] = useMMKVString("previousServers");
  const [api] = useAtom(apiAtom);
  const [switchingServer, setSwitchingServer] = useState<string | null>(null);
  const { switchServer } = useJellyfin();
  const { t } = useTranslation();

  const previousServers = useMemo(() => {
    const servers = JSON.parse(_previousServers || "[]") as Server[];
    // Filter out the current server since we don't need to "switch" to it
    const currentServer = api?.basePath;
    return servers.filter((server) => server.address !== currentServer);
  }, [_previousServers, api?.basePath]);

  const handleServerSwitch = async (server: Server) => {
    try {
      setSwitchingServer(server.address);
      await switchServer(server);
    } catch (error) {
      console.error("Failed to switch server:", error);
      setSwitchingServer(null);
    }
  };

  const getServerDisplayName = (server: Server) => {
    if (server.serverName) {
      return `${server.serverName} (${server.address})`;
    }
    return server.address;
  };

  const getServerSubtitle = (server: Server) => {
    if (server.lastUsername) {
      const hasToken = !!server.savedToken;
      return hasToken 
        ? `${server.lastUsername} • Auto-login available`
        : `Last user: ${server.lastUsername}`;
    }
    return undefined;
  };

  if (!previousServers.length) {
    return (
      <View {...props}>
        <ListGroup title={t("server.quick_switch")}>
          <ListItem title={t("server.no_previous_servers")} disabled />
        </ListGroup>
      </View>
    );
  }

  return (
    <View {...props}>
      <ListGroup title={t("server.quick_switch")}>
        {previousServers.map((server) => (
          <ListItem
            key={server.address}
            onPress={() => handleServerSwitch(server)}
            title={getServerDisplayName(server)}
            subtitle={getServerSubtitle(server)}
            icon={server.savedToken ? "key" : "server"}
            showArrow
            disabled={switchingServer === server.address}
          />
        ))}
      </ListGroup>
    </View>
  );
};
