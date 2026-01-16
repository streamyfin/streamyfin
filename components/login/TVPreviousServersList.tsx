import { Ionicons } from "@expo/vector-icons";
import type React from "react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Modal, View } from "react-native";
import { useMMKVString } from "react-native-mmkv";
import { Button } from "@/components/Button";
import { Text } from "@/components/common/Text";
import {
  deleteAccountCredential,
  getPreviousServers,
  type SavedServer,
  type SavedServerAccount,
} from "@/utils/secureCredentials";
import { TVAccountCard } from "./TVAccountCard";
import { TVServerCard } from "./TVServerCard";

interface TVPreviousServersListProps {
  onServerSelect: (server: SavedServer) => void;
  onQuickLogin?: (serverUrl: string, userId: string) => Promise<void>;
  onPasswordLogin?: (
    serverUrl: string,
    username: string,
    password: string,
  ) => Promise<void>;
  onAddAccount?: (server: SavedServer) => void;
  onPinRequired?: (server: SavedServer, account: SavedServerAccount) => void;
  onPasswordRequired?: (
    server: SavedServer,
    account: SavedServerAccount,
  ) => void;
}

export const TVPreviousServersList: React.FC<TVPreviousServersListProps> = ({
  onServerSelect,
  onQuickLogin,
  onAddAccount,
  onPinRequired,
  onPasswordRequired,
}) => {
  const { t } = useTranslation();
  const [_previousServers, setPreviousServers] =
    useMMKVString("previousServers");
  const [loadingServer, setLoadingServer] = useState<string | null>(null);
  const [selectedServer, setSelectedServer] = useState<SavedServer | null>(
    null,
  );
  const [showAccountsModal, setShowAccountsModal] = useState(false);

  const previousServers = useMemo(() => {
    return JSON.parse(_previousServers || "[]") as SavedServer[];
  }, [_previousServers]);

  const refreshServers = () => {
    const servers = getPreviousServers();
    setPreviousServers(JSON.stringify(servers));
  };

  const handleAccountLogin = async (
    server: SavedServer,
    account: SavedServerAccount,
  ) => {
    setShowAccountsModal(false);

    switch (account.securityType) {
      case "none":
        if (onQuickLogin) {
          setLoadingServer(server.address);
          try {
            await onQuickLogin(server.address, account.userId);
          } catch {
            Alert.alert(
              t("server.session_expired"),
              t("server.please_login_again"),
              [{ text: t("common.ok"), onPress: () => onServerSelect(server) }],
            );
          } finally {
            setLoadingServer(null);
          }
        }
        break;

      case "pin":
        if (onPinRequired) {
          onPinRequired(server, account);
        }
        break;

      case "password":
        if (onPasswordRequired) {
          onPasswordRequired(server, account);
        }
        break;
    }
  };

  const handleServerPress = (server: SavedServer) => {
    if (loadingServer) return;

    const accountCount = server.accounts?.length || 0;

    if (accountCount === 0) {
      onServerSelect(server);
    } else if (accountCount === 1) {
      handleAccountLogin(server, server.accounts[0]);
    } else {
      setSelectedServer(server);
      setShowAccountsModal(true);
    }
  };

  const getServerSubtitle = (server: SavedServer): string | undefined => {
    const accountCount = server.accounts?.length || 0;

    if (accountCount > 1) {
      return t("server.accounts_count", { count: accountCount });
    }
    if (accountCount === 1) {
      return `${server.accounts[0].username} • ${t("server.saved")}`;
    }
    return server.name ? server.address : undefined;
  };

  const getSecurityIcon = (
    server: SavedServer,
  ): keyof typeof Ionicons.glyphMap | null => {
    const accountCount = server.accounts?.length || 0;
    if (accountCount === 0) return null;

    if (accountCount > 1) {
      return "people";
    }

    const account = server.accounts[0];
    switch (account.securityType) {
      case "pin":
        return "keypad";
      case "password":
        return "lock-closed";
      default:
        return "key";
    }
  };

  const handleDeleteAccount = async (account: SavedServerAccount) => {
    if (!selectedServer) return;

    Alert.alert(
      t("server.remove_saved_login"),
      t("server.remove_account_description", { username: account.username }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.remove"),
          style: "destructive",
          onPress: async () => {
            await deleteAccountCredential(
              selectedServer.address,
              account.userId,
            );
            refreshServers();
            if (selectedServer.accounts.length <= 1) {
              setShowAccountsModal(false);
            }
          },
        },
      ],
    );
  };

  if (!previousServers.length) return null;

  return (
    <View style={{ marginTop: 32 }}>
      <Text
        style={{
          fontSize: 24,
          fontWeight: "600",
          color: "#FFFFFF",
          marginBottom: 16,
        }}
      >
        {t("server.previous_servers")}
      </Text>

      <View style={{ gap: 12 }}>
        {previousServers.map((server) => (
          <TVServerCard
            key={server.address}
            title={server.name || server.address}
            subtitle={getServerSubtitle(server)}
            securityIcon={getSecurityIcon(server)}
            isLoading={loadingServer === server.address}
            onPress={() => handleServerPress(server)}
          />
        ))}
      </View>

      {/* TV Account Selection Modal */}
      <Modal
        visible={showAccountsModal}
        transparent
        animationType='fade'
        onRequestClose={() => setShowAccountsModal(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0, 0, 0, 0.9)",
            justifyContent: "center",
            alignItems: "center",
            padding: 80,
          }}
        >
          <View
            style={{
              backgroundColor: "#1a1a1a",
              borderRadius: 24,
              padding: 40,
              width: "100%",
              maxWidth: 700,
            }}
          >
            <Text
              style={{
                fontSize: 32,
                fontWeight: "bold",
                color: "#FFFFFF",
                marginBottom: 8,
              }}
            >
              {t("server.select_account")}
            </Text>
            <Text
              style={{
                fontSize: 18,
                color: "#9CA3AF",
                marginBottom: 32,
              }}
            >
              {selectedServer?.name || selectedServer?.address}
            </Text>

            <View style={{ gap: 12, marginBottom: 24 }}>
              {selectedServer?.accounts.map((account, index) => (
                <TVAccountCard
                  key={account.userId}
                  account={account}
                  onPress={() =>
                    selectedServer &&
                    handleAccountLogin(selectedServer, account)
                  }
                  onLongPress={() => handleDeleteAccount(account)}
                  hasTVPreferredFocus={index === 0}
                />
              ))}
            </View>

            <View style={{ gap: 12 }}>
              <Button
                onPress={() => {
                  setShowAccountsModal(false);
                  if (selectedServer && onAddAccount) {
                    onAddAccount(selectedServer);
                  }
                }}
                color='purple'
              >
                {t("server.add_account")}
              </Button>
              <Button
                onPress={() => setShowAccountsModal(false)}
                color='black'
                className='bg-neutral-800'
              >
                {t("common.cancel")}
              </Button>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};
