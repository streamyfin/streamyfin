import type React from "react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { useMMKVString } from "react-native-mmkv";
import { ListGroup } from "./list/ListGroup";
import { ListItem } from "./list/ListItem";

interface Server {
  address: string;
  serverName?: string;
  serverId?: string;
  lastUsername?: string;
  savedToken?: string;
}

interface PreviousServersListProps {
  onServerSelect: (server: Server) => void;
}

export const PreviousServersList: React.FC<PreviousServersListProps> = ({
  onServerSelect,
}) => {
  const [_previousServers, setPreviousServers] =
    useMMKVString("previousServers");

  const previousServers = useMemo(() => {
    return JSON.parse(_previousServers || "[]") as Server[];
  }, [_previousServers]);

  const { t } = useTranslation();

  const getServerDisplayName = (server: Server) => {
    if (server.serverName) {
      return `${server.serverName}`;
    }
    return server.address;
  };

  const getServerSubtitle = (server: Server) => {
    if (server.lastUsername) {
      return `${server.address} • ${server.lastUsername}`;
    }
    return server.address;
  };

  if (!previousServers.length) return null;

  return (
    <View>
      <ListGroup title={t("server.previous_servers")} className='mt-4'>
        {previousServers.map((s) => (
          <ListItem
            key={s.address}
            onPress={() => onServerSelect(s)}
            title={getServerDisplayName(s)}
            subtitle={getServerSubtitle(s)}
            icon={s.savedToken ? "key" : "server"}
            showArrow
          />
        ))}
        <ListItem
          onPress={() => {
            setPreviousServers("[]");
          }}
          title={t("server.clear_button")}
          textColor='red'
        />
      </ListGroup>
    </View>
  );
};
