import { Ionicons } from "@expo/vector-icons";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, View } from "react-native";
import { useMMKVString } from "react-native-mmkv";
import { Text } from "@/components/common/Text";
import { useScaledTVTypography } from "@/constants/TVTypography";
import { useTVAccountSelectModal } from "@/hooks/useTVAccountSelectModal";
import {
  deleteAccountCredential,
  getPreviousServers,
  type SavedServer,
  type SavedServerAccount,
} from "@/utils/secureCredentials";
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
  // Called when server is pressed to show action sheet (handled by parent)
  onServerAction?: (server: SavedServer) => void;
  // Called by parent when "Login" is selected from action sheet
  loginServerOverride?: SavedServer | null;
  // Disable all focusable elements (when a modal is open)
  disabled?: boolean;
}

export const TVPreviousServersList: React.FC<TVPreviousServersListProps> = ({
  onServerSelect,
  onQuickLogin,
  onAddAccount,
  onPinRequired,
  onPasswordRequired,
  onServerAction,
  loginServerOverride,
  disabled = false,
}) => {
  const { t } = useTranslation();
  const typography = useScaledTVTypography();
  const { showAccountSelectModal } = useTVAccountSelectModal();
  const [_previousServers, setPreviousServers] =
    useMMKVString("previousServers");
  const [loadingServer, setLoadingServer] = useState<string | null>(null);

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

  const handleDeleteAccount = async (
    server: SavedServer,
    account: SavedServerAccount,
  ) => {
    Alert.alert(
      t("server.remove_saved_login"),
      t("server.remove_account_description", { username: account.username }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.remove"),
          style: "destructive",
          onPress: async () => {
            await deleteAccountCredential(server.address, account.userId);
            refreshServers();
          },
        },
      ],
    );
  };

  const showAccountSelection = (server: SavedServer) => {
    showAccountSelectModal({
      server,
      onAccountSelect: (account) => handleAccountLogin(server, account),
      onAddAccount: () => {
        if (onAddAccount) {
          onAddAccount(server);
        }
      },
      onDeleteAccount: (account) => handleDeleteAccount(server, account),
    });
  };

  // When parent triggers login via loginServerOverride, execute the login flow
  useEffect(() => {
    if (loginServerOverride) {
      const accountCount = loginServerOverride.accounts?.length || 0;

      if (accountCount === 0) {
        onServerSelect(loginServerOverride);
      } else if (accountCount === 1) {
        handleAccountLogin(
          loginServerOverride,
          loginServerOverride.accounts[0],
        );
      } else {
        showAccountSelection(loginServerOverride);
      }
    }
  }, [loginServerOverride]);

  const handleServerPress = (server: SavedServer) => {
    if (loadingServer) return;

    // If onServerAction is provided, delegate to parent for action sheet handling
    if (onServerAction) {
      onServerAction(server);
      return;
    }

    // Fallback: direct login flow (for backwards compatibility)
    const accountCount = server.accounts?.length || 0;
    if (accountCount === 0) {
      onServerSelect(server);
    } else if (accountCount === 1) {
      handleAccountLogin(server, server.accounts[0]);
    } else {
      showAccountSelection(server);
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

  if (!previousServers.length) return null;

  return (
    <View style={{ marginTop: 32 }}>
      <Text
        style={{
          fontSize: typography.heading,
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
            disabled={disabled}
          />
        ))}
      </View>
    </View>
  );
};
