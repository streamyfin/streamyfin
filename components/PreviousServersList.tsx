import type React from "react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { useMMKVString } from "react-native-mmkv";
import { storage } from "@/utils/mmkv";
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
  const [_previousServers] = useMMKVString("previousServers");

  const previousServers = useMemo(() => {
    return JSON.parse(_previousServers || "[]") as Server[];
  }, [_previousServers]);

  const { t } = useTranslation();

  if (!previousServers.length) return null;

  return (
    <View>
      <ListGroup title={t("server.previous_servers")} className='mt-4'>
        {previousServers.map((s) => (
          <ListItem
            key={s.address}
            onPress={() => onServerSelect(s)}
            title={s.address}
            showArrow
            className='min-h-[48px] py-2'
          />
        ))}
        <ListItem
          onPress={() => {
            storage.delete("previousServers");
          }}
          title={t("server.clear_button")}
          textColor='red'
          className='min-h-[48px] py-2'
        />
      </ListGroup>
    </View>
  );
};
