import { Ionicons } from "@expo/vector-icons";
import type React from "react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Alert, TouchableOpacity, View } from "react-native";
import { useMMKVString } from "react-native-mmkv";
import { Colors } from "@/constants/Colors";
import {
  deleteServerCredential,
  type SavedServer,
} from "@/utils/secureCredentials";
import { ListGroup } from "./list/ListGroup";
import { ListItem } from "./list/ListItem";

interface PreviousServersListProps {
  onServerSelect: (server: SavedServer) => void;
  onQuickLogin?: (serverUrl: string) => Promise<void>;
}

export const PreviousServersList: React.FC<PreviousServersListProps> = ({
  onServerSelect,
  onQuickLogin,
}) => {
  const [_previousServers, setPreviousServers] =
    useMMKVString("previousServers");
  const [loadingServer, setLoadingServer] = useState<string | null>(null);

  const previousServers = useMemo(() => {
    return JSON.parse(_previousServers || "[]") as SavedServer[];
  }, [_previousServers]);

  const { t } = useTranslation();

  const handleServerPress = async (server: SavedServer) => {
    if (loadingServer) return; // Prevent double-tap

    if (server.hasCredentials && onQuickLogin) {
      // Quick login with saved credentials
      setLoadingServer(server.address);
      try {
        await onQuickLogin(server.address);
      } catch (_error) {
        // Token expired/invalid, fall back to manual login
        Alert.alert(
          t("server.session_expired"),
          t("server.please_login_again"),
          [{ text: t("common.ok"), onPress: () => onServerSelect(server) }],
        );
      } finally {
        setLoadingServer(null);
      }
    } else {
      onServerSelect(server);
    }
  };

  const handleRemoveCredential = async (serverUrl: string) => {
    Alert.alert(
      t("server.remove_saved_login"),
      t("server.remove_saved_login_description"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.remove"),
          style: "destructive",
          onPress: async () => {
            await deleteServerCredential(serverUrl);
            // Update UI
            const updated = previousServers.map((s) =>
              s.address === serverUrl
                ? { ...s, hasCredentials: false, username: undefined }
                : s,
            );
            setPreviousServers(JSON.stringify(updated));
          },
        },
      ],
    );
  };

  if (!previousServers.length) return null;

  return (
    <View>
      <ListGroup title={t("server.previous_servers")} className='mt-4'>
        {previousServers.map((s) => (
          <ListItem
            key={s.address}
            onPress={() => handleServerPress(s)}
            title={s.name || s.address}
            subtitle={
              s.hasCredentials
                ? `${s.username} • ${t("server.saved")}`
                : s.name
                  ? s.address
                  : undefined
            }
            showArrow={loadingServer !== s.address}
            disabled={loadingServer === s.address}
          >
            {loadingServer === s.address ? (
              <ActivityIndicator size='small' color={Colors.primary} />
            ) : s.hasCredentials ? (
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation();
                  handleRemoveCredential(s.address);
                }}
                className='p-1'
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name='key' size={16} color={Colors.primary} />
              </TouchableOpacity>
            ) : null}
          </ListItem>
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
