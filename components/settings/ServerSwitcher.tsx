import type React from "react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { View, type ViewProps } from "react-native";
import { useMMKVString } from "react-native-mmkv";
import { useJellyfin } from "@/providers/JellyfinProvider";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";

interface Server {
  address: string;
}

interface Props extends ViewProps {}

export const ServerSwitcher: React.FC<Props> = ({ ...props }) => {
  const [_previousServers] = useMMKVString("previousServers");
  const { switchServer } = useJellyfin();
  const { t } = useTranslation();

  const previousServers = useMemo(() => {
    return JSON.parse(_previousServers || "[]") as Server[];
  }, [_previousServers]);

  const handleServerSwitch = async (server: Server) => {
    try {
      await switchServer(server);
    } catch (error) {
      console.error("Failed to switch server:", error);
    }
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
            title={server.address}
            showArrow
          />
        ))}
      </ListGroup>
    </View>
  );
};
