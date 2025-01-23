import React, { useMemo } from "react";
import { View } from "react-native";
import { useMMKVString } from "react-native-mmkv";
import { ListGroup } from "./list/ListGroup";
import { ListItem } from "./list/ListItem";

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

  if (!previousServers.length) return null;

  return (
    <View>
      <ListGroup title="previous servers" className="mt-4">
        {previousServers.map((s) => (
          <ListItem
            key={s.address}
            onPress={() => onServerSelect(s)}
            title={s.address}
            showArrow
          />
        ))}
        <ListItem
          onPress={() => {
            setPreviousServers("[]");
          }}
          title={"Clear"}
          textColor="red"
        />
      </ListGroup>
    </View>
  );
};
