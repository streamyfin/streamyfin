import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import type React from "react";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { useMMKVString } from "react-native-mmkv";
import { Button } from "@/components/Button";
import { Text } from "@/components/common/Text";
import {
  deleteAccountCredential,
  getPreviousServers,
  removeServerFromList,
  type SavedServer,
  type SavedServerAccount,
} from "@/utils/secureCredentials";
import { TVAccountCard } from "./TVAccountCard";
import { TVServerCard } from "./TVServerCard";

// Action card for server action sheet (Apple TV style)
const TVServerActionCard: React.FC<{
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  variant?: "default" | "destructive";
  hasTVPreferredFocus?: boolean;
  onPress: () => void;
}> = ({ label, icon, variant = "default", hasTVPreferredFocus, onPress }) => {
  const [focused, setFocused] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = (v: number) =>
    Animated.timing(scale, {
      toValue: v,
      duration: 150,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();

  const isDestructive = variant === "destructive";

  return (
    <Pressable
      onPress={onPress}
      onFocus={() => {
        setFocused(true);
        animateTo(1.05);
      }}
      onBlur={() => {
        setFocused(false);
        animateTo(1);
      }}
      hasTVPreferredFocus={hasTVPreferredFocus}
    >
      <Animated.View
        style={{
          transform: [{ scale }],
          width: 180,
          height: 90,
          backgroundColor: focused
            ? isDestructive
              ? "#ef4444"
              : "#fff"
            : isDestructive
              ? "rgba(239, 68, 68, 0.2)"
              : "rgba(255,255,255,0.08)",
          borderRadius: 14,
          justifyContent: "center",
          alignItems: "center",
          paddingHorizontal: 12,
          gap: 8,
        }}
      >
        <Ionicons
          name={icon}
          size={28}
          color={
            focused
              ? isDestructive
                ? "#fff"
                : "#000"
              : isDestructive
                ? "#ef4444"
                : "#fff"
          }
        />
        <Text
          style={{
            fontSize: 16,
            color: focused
              ? isDestructive
                ? "#fff"
                : "#000"
              : isDestructive
                ? "#ef4444"
                : "#fff",
            fontWeight: "600",
            textAlign: "center",
          }}
          numberOfLines={1}
        >
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
};

// Server action sheet component (bottom sheet with horizontal scrolling)
const TVServerActionSheet: React.FC<{
  visible: boolean;
  server: SavedServer | null;
  onLogin: () => void;
  onDelete: () => void;
  onClose: () => void;
}> = ({ visible, server, onLogin, onDelete, onClose }) => {
  const { t } = useTranslation();

  if (!visible || !server) return null;

  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        justifyContent: "flex-end",
        zIndex: 1000,
      }}
    >
      <BlurView
        intensity={80}
        tint='dark'
        style={{
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            paddingTop: 24,
            paddingBottom: 50,
            overflow: "visible",
          }}
        >
          {/* Title */}
          <Text
            style={{
              fontSize: 18,
              fontWeight: "500",
              color: "rgba(255,255,255,0.6)",
              marginBottom: 8,
              paddingHorizontal: 48,
              textTransform: "uppercase",
              letterSpacing: 1,
            }}
          >
            {server.name || server.address}
          </Text>

          {/* Horizontal options */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ overflow: "visible" }}
            contentContainerStyle={{
              paddingHorizontal: 48,
              paddingVertical: 10,
              gap: 12,
            }}
          >
            <TVServerActionCard
              label={t("common.login")}
              icon='log-in-outline'
              hasTVPreferredFocus
              onPress={onLogin}
            />
            <TVServerActionCard
              label={t("common.delete")}
              icon='trash-outline'
              variant='destructive'
              onPress={onDelete}
            />
          </ScrollView>
        </View>
      </BlurView>
    </View>
  );
};

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
  const [showActionSheet, setShowActionSheet] = useState(false);

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
    setSelectedServer(server);
    setShowActionSheet(true);
  };

  const handleServerLoginAction = () => {
    if (!selectedServer) return;
    setShowActionSheet(false);

    const accountCount = selectedServer.accounts?.length || 0;

    if (accountCount === 0) {
      onServerSelect(selectedServer);
    } else if (accountCount === 1) {
      handleAccountLogin(selectedServer, selectedServer.accounts[0]);
    } else {
      setShowAccountsModal(true);
    }
  };

  const handleServerDeleteAction = () => {
    if (!selectedServer) return;

    Alert.alert(
      t("server.remove_server"),
      t("server.remove_server_description", {
        server: selectedServer.name || selectedServer.address,
      }),
      [
        {
          text: t("common.cancel"),
          style: "cancel",
          onPress: () => setShowActionSheet(false),
        },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: async () => {
            await removeServerFromList(selectedServer.address);
            refreshServers();
            setShowActionSheet(false);
            setSelectedServer(null);
          },
        },
      ],
    );
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

      {/* TV Server Action Sheet */}
      <TVServerActionSheet
        visible={showActionSheet}
        server={selectedServer}
        onLogin={handleServerLoginAction}
        onDelete={handleServerDeleteAction}
        onClose={() => setShowActionSheet(false)}
      />
    </View>
  );
};
