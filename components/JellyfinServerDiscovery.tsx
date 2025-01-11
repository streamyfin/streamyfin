import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useJellyfinDiscovery } from "@/hooks/useJellyfinDiscovery";
import { Button } from "./Button";
import { ListGroup } from "./list/ListGroup";
import { ListItem } from "./list/ListItem";

interface Props {
  onServerSelect?: (server: { address: string; serverName?: string }) => void;
}

const JellyfinServerDiscovery: React.FC<Props> = ({ onServerSelect }) => {
  const { servers, isSearching, startDiscovery } = useJellyfinDiscovery();

  return (
    <View className="mt-2">
      <Button onPress={startDiscovery} color="black">
        <Text className="text-white text-center">
          {isSearching ? "Searching..." : "Search for local servers"}
        </Text>
      </Button>

      {servers.length ? (
        <ListGroup title="Servers" className="mt-4">
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
