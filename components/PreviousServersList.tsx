import { Ionicons } from "@expo/vector-icons";
import type React from "react";
import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Alert, TouchableOpacity, View } from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { useMMKVString } from "react-native-mmkv";
import { Colors } from "@/constants/Colors";
import {
  deleteAccountCredential,
  getPreviousServers,
  removeServerFromList,
  type SavedServer,
  type SavedServerAccount,
} from "@/utils/secureCredentials";
import { AccountsSheet } from "./AccountsSheet";
import { Text } from "./common/Text";
import { ListGroup } from "./list/ListGroup";
import { ListItem } from "./list/ListItem";
import { PasswordEntryModal } from "./PasswordEntryModal";
import { PINEntryModal } from "./PINEntryModal";

interface PreviousServersListProps {
  onServerSelect: (server: SavedServer) => void;
  onQuickLogin?: (serverUrl: string, userId: string) => Promise<void>;
  onPasswordLogin?: (
    serverUrl: string,
    username: string,
    password: string,
  ) => Promise<void>;
  onAddAccount?: (server: SavedServer) => void;
}

export const PreviousServersList: React.FC<PreviousServersListProps> = ({
  onServerSelect,
  onQuickLogin,
  onPasswordLogin,
  onAddAccount,
}) => {
  const [_previousServers, setPreviousServers] =
    useMMKVString("previousServers");
  const [loadingServer, setLoadingServer] = useState<string | null>(null);

  // Modal states
  const [accountsSheetOpen, setAccountsSheetOpen] = useState(false);
  const [selectedServer, setSelectedServer] = useState<SavedServer | null>(
    null,
  );
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [selectedAccount, setSelectedAccount] =
    useState<SavedServerAccount | null>(null);

  const previousServers = useMemo(() => {
    return JSON.parse(_previousServers || "[]") as SavedServer[];
  }, [_previousServers]);

  const { t } = useTranslation();

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
        // Quick login without protection
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
        // Show PIN entry modal
        setSelectedServer(server);
        setSelectedAccount(account);
        setPinModalVisible(true);
        break;

      case "password":
        // Show password entry modal
        setSelectedServer(server);
        setSelectedAccount(account);
        setPasswordModalVisible(true);
        break;
    }
  };

  const handleServerPress = async (server: SavedServer) => {
    if (loadingServer) return; // Prevent double-tap

    const accountCount = server.accounts?.length || 0;

    if (accountCount === 0) {
      // No saved accounts, go to manual login
      onServerSelect(server);
    } else {
      // Has accounts, show account sheet (allows adding new account too)
      setSelectedServer(server);
      setAccountsSheetOpen(true);
    }
  };

  const handlePinSuccess = async () => {
    setPinModalVisible(false);
    if (selectedServer && selectedAccount && onQuickLogin) {
      setLoadingServer(selectedServer.address);
      try {
        await onQuickLogin(selectedServer.address, selectedAccount.userId);
      } catch {
        Alert.alert(
          t("server.session_expired"),
          t("server.please_login_again"),
          [
            {
              text: t("common.ok"),
              onPress: () => onServerSelect(selectedServer),
            },
          ],
        );
      } finally {
        setLoadingServer(null);
        setSelectedAccount(null);
        setSelectedServer(null);
      }
    }
  };

  const handlePasswordSubmit = async (password: string) => {
    if (selectedServer && selectedAccount && onPasswordLogin) {
      await onPasswordLogin(
        selectedServer.address,
        selectedAccount.username,
        password,
      );
      setPasswordModalVisible(false);
      setSelectedAccount(null);
      setSelectedServer(null);
    }
  };

  const handleForgotPIN = async () => {
    if (selectedServer && selectedAccount) {
      await deleteAccountCredential(
        selectedServer.address,
        selectedAccount.userId,
      );
      refreshServers();
      // Go to manual login
      onServerSelect(selectedServer);
      setSelectedAccount(null);
      setSelectedServer(null);
    }
  };

  const handleRemoveFirstCredential = async (serverUrl: string) => {
    const server = previousServers.find((s) => s.address === serverUrl);
    if (!server || server.accounts.length === 0) return;

    Alert.alert(
      t("server.remove_saved_login"),
      t("server.remove_saved_login_description"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.remove"),
          style: "destructive",
          onPress: async () => {
            // Remove first account
            await deleteAccountCredential(serverUrl, server.accounts[0].userId);
            refreshServers();
          },
        },
      ],
    );
  };

  const handleRemoveServer = useCallback(
    async (serverUrl: string) => {
      await removeServerFromList(serverUrl);
      refreshServers();
    },
    [setPreviousServers],
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
    <View>
      <ListGroup title={t("server.previous_servers")} className='mt-4'>
        {previousServers.map((s) => (
          <ServerItem
            key={s.address}
            server={s}
            loadingServer={loadingServer}
            onPress={() => handleServerPress(s)}
            onRemoveCredential={() => handleRemoveFirstCredential(s.address)}
            renderRightActions={renderRightActions}
            subtitle={getServerSubtitle(s)}
            securityIcon={getSecurityIcon(s)}
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

      {/* Account Selection Sheet */}
      <AccountsSheet
        open={accountsSheetOpen}
        setOpen={setAccountsSheetOpen}
        server={selectedServer}
        onAccountSelect={(account) => {
          if (selectedServer) {
            handleAccountLogin(selectedServer, account);
          }
        }}
        onAddAccount={() => {
          if (selectedServer && onAddAccount) {
            onAddAccount(selectedServer);
          }
        }}
        onAccountDeleted={refreshServers}
      />

      {/* PIN Entry Modal */}
      <PINEntryModal
        visible={pinModalVisible}
        onClose={() => {
          setPinModalVisible(false);
          setSelectedAccount(null);
          setSelectedServer(null);
        }}
        onSuccess={handlePinSuccess}
        onForgotPIN={handleForgotPIN}
        serverUrl={selectedServer?.address || ""}
        userId={selectedAccount?.userId || ""}
        username={selectedAccount?.username || ""}
      />

      {/* Password Entry Modal */}
      <PasswordEntryModal
        visible={passwordModalVisible}
        onClose={() => {
          setPasswordModalVisible(false);
          setSelectedAccount(null);
          setSelectedServer(null);
        }}
        onSubmit={handlePasswordSubmit}
        username={selectedAccount?.username || ""}
      />
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
  subtitle?: string;
  securityIcon: keyof typeof Ionicons.glyphMap | null;
}

const ServerItem: React.FC<ServerItemProps> = ({
  server,
  loadingServer,
  onPress,
  onRemoveCredential,
  renderRightActions,
  subtitle,
  securityIcon,
}) => {
  const swipeableRef = useRef<Swipeable>(null);
  const hasAccounts = server.accounts?.length > 0;

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
        subtitle={subtitle}
        showArrow={loadingServer !== server.address}
        disabled={loadingServer === server.address}
      >
        {loadingServer === server.address ? (
          <ActivityIndicator size='small' color={Colors.primary} />
        ) : hasAccounts && securityIcon ? (
          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation();
              onRemoveCredential();
            }}
            className='p-1'
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name={securityIcon} size={16} color={Colors.primary} />
          </TouchableOpacity>
        ) : null}
      </ListItem>
    </Swipeable>
  );
};
