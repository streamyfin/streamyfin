import { Ionicons } from "@expo/vector-icons";
import type React from "react";
import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Alert, TouchableOpacity, View } from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { useMMKVString } from "react-native-mmkv";
import { Colors } from "@/constants/Colors";
import {
  deleteServerCredential,
  removeServerFromList,
  type SavedServer,
} from "@/utils/secureCredentials";
import { Text } from "./common/Text";
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

  const handleRemoveServer = useCallback(
    async (serverUrl: string) => {
      await removeServerFromList(serverUrl);
      // Update UI
      const filtered = previousServers.filter((s) => s.address !== serverUrl);
      setPreviousServers(JSON.stringify(filtered));
    },
    [previousServers, setPreviousServers],
  );

  const renderRightActions = useCallback(
    (serverUrl: string, swipeableRef: React.RefObject<Swipeable | null>) => (
      <TouchableOpacity
        onPress={() => {
          swipeableRef.current?.close();
          handleRemoveServer(serverUrl);
        }}
        className='bg-red-600 justify-center items-center px-5'
      >
        <Ionicons name='trash' size={20} color='white' />
      </TouchableOpacity>
    ),
    [handleRemoveServer],
  );

  if (!previousServers.length) return null;

  return (
    <View>
      <ListGroup title={t("server.previous_servers")} className='mt-4'>
        {previousServers.map((s) => (
          <ServerItem
            key={s.address}
            server={s}
            loadingServer={loadingServer}
            onPress={() => handleServerPress(s)}
            onRemoveCredential={() => handleRemoveCredential(s.address)}
            renderRightActions={renderRightActions}
            t={t}
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
      <Text className='text-xs text-neutral-500 mt-2 ml-4'>
        {t("server.swipe_to_remove")}
      </Text>
    </View>
  );
};

interface ServerItemProps {
  server: SavedServer;
  loadingServer: string | null;
  onPress: () => void;
  onRemoveCredential: () => void;
  renderRightActions: (
    serverUrl: string,
    swipeableRef: React.RefObject<Swipeable | null>,
  ) => React.ReactNode;
  t: (key: string) => string;
}

const ServerItem: React.FC<ServerItemProps> = ({
  server,
  loadingServer,
  onPress,
  onRemoveCredential,
  renderRightActions,
  t,
}) => {
  const swipeableRef = useRef<Swipeable>(null);

  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={() =>
        renderRightActions(server.address, swipeableRef)
      }
      overshootRight={false}
    >
      <ListItem
        onPress={onPress}
        title={server.name || server.address}
        subtitle={
          server.hasCredentials
            ? `${server.username} • ${t("server.saved")}`
            : server.name
              ? server.address
              : undefined
        }
        showArrow={loadingServer !== server.address}
        disabled={loadingServer === server.address}
      >
        {loadingServer === server.address ? (
          <ActivityIndicator size='small' color={Colors.primary} />
        ) : server.hasCredentials ? (
          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation();
              onRemoveCredential();
            }}
            className='p-1'
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name='key' size={16} color={Colors.primary} />
          </TouchableOpacity>
        ) : null}
      </ListItem>
    </Swipeable>
  );
};
