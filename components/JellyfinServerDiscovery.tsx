import { useJellyfinDiscovery } from "@/hooks/useJellyfinDiscovery";
import type React from "react";
import { useTranslation } from "react-i18next";
import { Text, TouchableOpacity, View } from "react-native";
import { Button } from "./Button";
import { ListGroup } from "./list/ListGroup";
import { ListItem } from "./list/ListItem";

interface Props {
  onServerSelect?: (server: { address: string; serverName?: string }) => void;
}

const JellyfinServerDiscovery: React.FC<Props> = ({ onServerSelect }) => {
  const { servers, isSearching, startDiscovery } = useJellyfinDiscovery();
  const { t } = useTranslation();

  return (
    <View className='mt-2'>
      <Button onPress={startDiscovery} color='black'>
        <Text className='text-white text-center'>
          {isSearching
            ? t("server.searching")
            : t("server.search_for_local_servers")}
        </Text>
      </Button>

      {servers.length ? (
        <ListGroup title={t("server.servers")} className='mt-4'>
          {servers.map((server) => (
            <ListItem
              key={server.address}
              onPress={() =>
                onServerSelect?.({
                  address: server.address,
                  serverName: server.serverName,
                })
              }
              title={server.address}
              showArrow
            />
          ))}
        </ListGroup>
      ) : null}
    </View>
  );
};

export default JellyfinServerDiscovery;
