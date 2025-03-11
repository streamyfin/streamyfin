import React, { useMemo } from "react";
import { View, Platform } from "react-native";
import { useMMKVString } from "react-native-mmkv";
import { ListGroup } from "./list/ListGroup";
import { ListItem } from "./list/ListItem";
import { useTranslation } from "react-i18next";
import { TVFocusable } from "./common/TVFocusable";

interface Server {
  address: string;
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

  if (!previousServers.length) return null;

  const handleClearServers = () => {
    setPreviousServers("[]");
  };

  return (
    <View>
      <ListGroup title={t("server.previous_servers")} className="mt-4">
        {previousServers.map((server, index) => (
          <ListItem
            key={server.address}
            onPress={() => onServerSelect(server)}
            title={server.address}
            showArrow
            hasTVPreferredFocus={index === 0}
          />
        ))}
        <ListItem
          onPress={handleClearServers}
          title={t("server.clear_button")}
          textColor="red"
        />
      </ListGroup>
    </View>
  );
};
