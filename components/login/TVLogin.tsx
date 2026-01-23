import { Ionicons } from "@expo/vector-icons";
import type { PublicSystemInfo } from "@jellyfin/sdk/lib/generated-client";
import { Image } from "expo-image";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { t } from "i18next";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { fontSize, size } from "react-native-responsive-sizes";
import { z } from "zod";
import { Button } from "@/components/Button";
import { Text } from "@/components/common/Text";
import { TVInput } from "@/components/login/TVInput";
import { TVPasswordEntryModal } from "@/components/login/TVPasswordEntryModal";
import { TVPINEntryModal } from "@/components/login/TVPINEntryModal";
import {
  TVPreviousServersList,
  TVServerActionSheet,
} from "@/components/login/TVPreviousServersList";
import { TVSaveAccountModal } from "@/components/login/TVSaveAccountModal";
import { TVSaveAccountToggle } from "@/components/login/TVSaveAccountToggle";
import { Colors } from "@/constants/Colors";
import { apiAtom, useJellyfin } from "@/providers/JellyfinProvider";
import {
  type AccountSecurityType,
  removeServerFromList,
  type SavedServer,
  type SavedServerAccount,
} from "@/utils/secureCredentials";

const CredentialsSchema = z.object({
  username: z.string().min(1, t("login.username_required")),
});

const TVBackButton: React.FC<{
  onPress: () => void;
  label: string;
  disabled?: boolean;
}> = ({ onPress, label, disabled = false }) => {
  const [isFocused, setIsFocused] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;

  const animateFocus = (focused: boolean) => {
    Animated.timing(scale, {
      toValue: focused ? 1.05 : 1,
      duration: 150,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  };

  return (
    <Pressable
      onPress={onPress}
      onFocus={() => {
        setIsFocused(true);
        animateFocus(true);
      }}
      onBlur={() => {
        setIsFocused(false);
        animateFocus(false);
      }}
      style={{ alignSelf: "flex-start", marginBottom: size(40) }}
      disabled={disabled}
      focusable={!disabled}
    >
      <Animated.View
        style={{
          transform: [{ scale }],
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: size(12),
          borderRadius: size(8),
          backgroundColor: isFocused
            ? "rgba(168, 85, 247, 0.2)"
            : "transparent",
          borderWidth: size(2),
          borderColor: isFocused ? Colors.primary : "transparent",
        }}
      >
        <Ionicons
          name='chevron-back'
          size={size(28)}
          color={isFocused ? "#FFFFFF" : Colors.primary}
        />
        <Text
          style={{
            color: isFocused ? "#FFFFFF" : Colors.primary,
            fontSize: fontSize(14),
            marginLeft: size(4),
          }}
        >
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
};

export const TVLogin: React.FC = () => {
  const api = useAtomValue(apiAtom);
  const navigation = useNavigation();
  const params = useLocalSearchParams();
  const {
    setServer,
    login,
    removeServer,
    initiateQuickConnect,
    loginWithSavedCredential,
    loginWithPassword,
  } = useJellyfin();

  const {
    apiUrl: _apiUrl,
    username: _username,
    password: _password,
  } = params as { apiUrl: string; username: string; password: string };

  const [loadingServerCheck, setLoadingServerCheck] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [serverURL, setServerURL] = useState<string>(_apiUrl || "");
  const [serverName, setServerName] = useState<string>("");
  const [credentials, setCredentials] = useState<{
    username: string;
    password: string;
  }>({
    username: _username || "",
    password: _password || "",
  });

  // Save account state
  const [saveAccount, setSaveAccount] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [pendingLogin, setPendingLogin] = useState<{
    username: string;
    password: string;
  } | null>(null);

  // PIN/Password entry for saved accounts
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [selectedServer, setSelectedServer] = useState<SavedServer | null>(
    null,
  );
  const [selectedAccount, setSelectedAccount] =
    useState<SavedServerAccount | null>(null);

  // Server action sheet state
  const [showServerActionSheet, setShowServerActionSheet] = useState(false);
  const [actionSheetServer, setActionSheetServer] =
    useState<SavedServer | null>(null);
  const [loginTriggerServer, setLoginTriggerServer] =
    useState<SavedServer | null>(null);
  const [actionSheetKey, setActionSheetKey] = useState(0);

  // Track if any modal is open to disable background focus
  const isAnyModalOpen =
    showSaveModal ||
    pinModalVisible ||
    passwordModalVisible ||
    showServerActionSheet;

  // Auto login from URL params
  useEffect(() => {
    (async () => {
      if (_apiUrl) {
        await setServer({ address: _apiUrl });
        setTimeout(() => {
          if (_username && _password) {
            setCredentials({ username: _username, password: _password });
            login(_username, _password);
          }
        }, 0);
      }
    })();
  }, [_apiUrl, _username, _password]);

  // Update header
  useEffect(() => {
    navigation.setOptions({
      headerTitle: serverName,
      headerShown: false,
    });
  }, [serverName, navigation]);

  const handleLogin = async () => {
    const result = CredentialsSchema.safeParse(credentials);
    if (!result.success) return;

    if (saveAccount) {
      setPendingLogin({
        username: credentials.username,
        password: credentials.password,
      });
      setShowSaveModal(true);
    } else {
      await performLogin(credentials.username, credentials.password);
    }
  };

  const performLogin = async (
    username: string,
    password: string,
    options?: {
      saveAccount?: boolean;
      securityType?: AccountSecurityType;
      pinCode?: string;
    },
  ) => {
    setLoading(true);
    try {
      await login(username, password, serverName, options);
    } catch (error) {
      if (error instanceof Error) {
        Alert.alert(t("login.connection_failed"), error.message);
      } else {
        Alert.alert(
          t("login.connection_failed"),
          t("login.an_unexpected_error_occured"),
        );
      }
    } finally {
      setLoading(false);
      setPendingLogin(null);
    }
  };

  const handleSaveAccountConfirm = async (
    securityType: AccountSecurityType,
    pinCode?: string,
  ) => {
    setShowSaveModal(false);
    if (pendingLogin) {
      await performLogin(pendingLogin.username, pendingLogin.password, {
        saveAccount: true,
        securityType,
        pinCode,
      });
    }
  };

  const handleQuickLoginWithSavedCredential = async (
    serverUrl: string,
    userId: string,
  ) => {
    await loginWithSavedCredential(serverUrl, userId);
  };

  const handlePasswordLogin = async (
    serverUrl: string,
    username: string,
    password: string,
  ) => {
    await loginWithPassword(serverUrl, username, password);
  };

  const handleAddAccount = (server: SavedServer) => {
    setServer({ address: server.address });
    if (server.name) {
      setServerName(server.name);
    }
  };

  const handlePinRequired = (
    server: SavedServer,
    account: SavedServerAccount,
  ) => {
    setSelectedServer(server);
    setSelectedAccount(account);
    setPinModalVisible(true);
  };

  const handlePasswordRequired = (
    server: SavedServer,
    account: SavedServerAccount,
  ) => {
    setSelectedServer(server);
    setSelectedAccount(account);
    setPasswordModalVisible(true);
  };

  const handlePinSuccess = async () => {
    setPinModalVisible(false);
    if (selectedServer && selectedAccount) {
      await handleQuickLoginWithSavedCredential(
        selectedServer.address,
        selectedAccount.userId,
      );
    }
    setSelectedServer(null);
    setSelectedAccount(null);
  };

  const handlePasswordSubmit = async (password: string) => {
    if (selectedServer && selectedAccount) {
      await handlePasswordLogin(
        selectedServer.address,
        selectedAccount.username,
        password,
      );
    }
    setPasswordModalVisible(false);
    setSelectedServer(null);
    setSelectedAccount(null);
  };

  const handleForgotPIN = async () => {
    if (selectedServer) {
      setSelectedServer(null);
      setSelectedAccount(null);
      setPinModalVisible(false);
    }
  };

  // Server action sheet handlers
  const handleServerAction = (server: SavedServer) => {
    setActionSheetServer(server);
    setActionSheetKey((k) => k + 1); // Force remount to reset focus
    setShowServerActionSheet(true);
  };

  const handleServerActionLogin = () => {
    setShowServerActionSheet(false);
    if (actionSheetServer) {
      // Trigger the login flow in TVPreviousServersList
      setLoginTriggerServer(actionSheetServer);
      // Reset the trigger after a tick to allow re-triggering the same server
      setTimeout(() => setLoginTriggerServer(null), 0);
    }
  };

  const handleServerActionDelete = () => {
    if (!actionSheetServer) return;

    Alert.alert(
      t("server.remove_server"),
      t("server.remove_server_description", {
        server: actionSheetServer.name || actionSheetServer.address,
      }),
      [
        {
          text: t("common.cancel"),
          style: "cancel",
          onPress: () => setShowServerActionSheet(false),
        },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: async () => {
            await removeServerFromList(actionSheetServer.address);
            setShowServerActionSheet(false);
            setActionSheetServer(null);
          },
        },
      ],
    );
  };

  const checkUrl = useCallback(async (url: string) => {
    setLoadingServerCheck(true);
    const baseUrl = url.replace(/^https?:\/\//i, "");
    const protocols = ["https", "http"];
    try {
      return checkHttp(baseUrl, protocols);
    } catch (e) {
      if (e instanceof Error && e.message === "Server too old") {
        throw e;
      }
      return undefined;
    } finally {
      setLoadingServerCheck(false);
    }
  }, []);

  async function checkHttp(baseUrl: string, protocols: string[]) {
    for (const protocol of protocols) {
      try {
        const response = await fetch(
          `${protocol}://${baseUrl}/System/Info/Public`,
          { mode: "cors" },
        );
        if (response.ok) {
          const data = (await response.json()) as PublicSystemInfo;
          const serverVersion = data.Version?.split(".");
          if (serverVersion && +serverVersion[0] <= 10) {
            if (+serverVersion[1] < 10) {
              Alert.alert(
                t("login.too_old_server_text"),
                t("login.too_old_server_description"),
              );
              throw new Error("Server too old");
            }
          }
          setServerName(data.ServerName || "");
          return `${protocol}://${baseUrl}`;
        }
      } catch (e) {
        if (e instanceof Error && e.message === "Server too old") {
          throw e;
        }
      }
    }
    return undefined;
  }

  const handleConnect = useCallback(async (url: string) => {
    url = url.trim().replace(/\/$/, "");
    console.log("[TVLogin] handleConnect called with:", url);
    try {
      const result = await checkUrl(url);
      console.log("[TVLogin] checkUrl result:", result);
      if (result === undefined) {
        Alert.alert(
          t("login.connection_failed"),
          t("login.could_not_connect_to_server"),
        );
        return;
      }
      console.log("[TVLogin] Calling setServer with:", result);
      await setServer({ address: result });
      console.log("[TVLogin] setServer completed successfully");
    } catch (error) {
      console.error("[TVLogin] Error in handleConnect:", error);
    }
  }, []);

  const handleQuickConnect = async () => {
    try {
      const code = await initiateQuickConnect();
      if (code) {
        Alert.alert(
          t("login.quick_connect"),
          t("login.enter_code_to_login", { code: code }),
          [{ text: t("login.got_it") }],
        );
      }
    } catch (_error) {
      Alert.alert(
        t("login.error_title"),
        t("login.failed_to_initiate_quick_connect"),
      );
    }
  };

  // Debug logging
  console.log("[TVLogin] Render - api?.basePath:", api?.basePath);

  return (
    <View style={{ flex: 1, backgroundColor: "#000000" }}>
      <View style={{ flex: 1 }}>
        {api?.basePath ? (
          // ==================== CREDENTIALS SCREEN ====================
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{
              flexGrow: 1,
              justifyContent: "center",
              alignItems: "center",
              paddingVertical: size(20),
            }}
            showsVerticalScrollIndicator={false}
          >
            <View
              style={{
                width: "100%",
                maxWidth: 800,
                paddingHorizontal: size(40),
              }}
            >
              {/* Back Button */}
              <TVBackButton
                onPress={() => removeServer()}
                label={t("login.change_server")}
                disabled={isAnyModalOpen}
              />

              {/* Title */}
              <Text
                style={{
                  fontSize: fontSize(12),
                  fontWeight: "bold",
                  color: "#FFFFFF",
                  marginBottom: size(8),
                }}
              >
                {serverName ? (
                  <>
                    {`${t("login.login_to_title")} `}
                    <Text style={{ color: Colors.primary }}>{serverName}</Text>
                  </>
                ) : (
                  t("login.login_title")
                )}
              </Text>
              <Text
                style={{
                  fontSize: fontSize(14),
                  color: "#9CA3AF",
                  marginBottom: size(40),
                }}
              >
                {api.basePath}
              </Text>

              {/* Username Input - extra padding for focus scale */}
              <View
                style={{ marginBottom: size(24), paddingHorizontal: size(8) }}
              >
                <TVInput
                  placeholder={t("login.username_placeholder")}
                  value={credentials.username}
                  onChangeText={(text) =>
                    setCredentials((prev) => ({ ...prev, username: text }))
                  }
                  autoCapitalize='none'
                  autoCorrect={false}
                  textContentType='username'
                  returnKeyType='next'
                  hasTVPreferredFocus
                  disabled={isAnyModalOpen}
                />
              </View>

              {/* Password Input */}
              <View
                style={{ marginBottom: size(32), paddingHorizontal: size(8) }}
              >
                <TVInput
                  placeholder={t("login.password_placeholder")}
                  value={credentials.password}
                  onChangeText={(text) =>
                    setCredentials((prev) => ({ ...prev, password: text }))
                  }
                  secureTextEntry
                  autoCapitalize='none'
                  textContentType='password'
                  returnKeyType='done'
                  disabled={isAnyModalOpen}
                />
              </View>

              {/* Save Account Toggle */}
              <View
                style={{ marginBottom: size(40), paddingHorizontal: size(8) }}
              >
                <TVSaveAccountToggle
                  value={saveAccount}
                  onValueChange={setSaveAccount}
                  label={t("save_account.save_for_later")}
                  disabled={isAnyModalOpen}
                />
              </View>

              {/* Login Button */}
              <View style={{ marginBottom: size(16) }}>
                <Button
                  onPress={handleLogin}
                  loading={loading}
                  disabled={!credentials.username.trim() || loading}
                >
                  {t("login.login_button")}
                </Button>
              </View>

              {/* Quick Connect Button */}
              <Button
                onPress={handleQuickConnect}
                color='black'
                className='bg-neutral-800 border border-neutral-700'
              >
                {t("login.quick_connect")}
              </Button>
            </View>
          </ScrollView>
        ) : (
          // ==================== SERVER SELECTION SCREEN ====================
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{
              flexGrow: 1,
              // justifyContent: "center",
              alignItems: "center",
              justifyContent: "flex-start",
              paddingTop: size(40),
              paddingBottom: size(40),
            }}
            showsVerticalScrollIndicator={false}
          >
            <View
              style={{
                width: "100%",
                maxWidth: 800,
                paddingHorizontal: size(60),
              }}
            >
              {/* Logo */}
              <View style={{ alignItems: "center", marginBottom: size(16) }}>
                <Image
                  source={require("@/assets/images/icon-tvos.png")}
                  style={{ width: size(300), height: size(300) }}
                  contentFit='contain'
                />
              </View>

              {/* Title */}
              <Text
                style={{
                  fontSize: fontSize(24),
                  fontWeight: "bold",
                  color: "#FFFFFF",
                  textAlign: "center",
                  marginBottom: size(8),
                }}
              >
                Streamyfin
              </Text>
              <Text
                style={{
                  fontSize: fontSize(20),
                  color: "#9CA3AF",
                  textAlign: "center",
                  marginBottom: size(40),
                }}
              >
                {t("server.enter_url_to_jellyfin_server")}
              </Text>

              {/* Server URL Input - extra padding for focus scale */}
              <View
                style={{ marginBottom: size(24), paddingHorizontal: size(8) }}
              >
                <TVInput
                  placeholder={t("server.server_url_placeholder")}
                  value={serverURL}
                  onChangeText={setServerURL}
                  keyboardType='url'
                  autoCapitalize='none'
                  textContentType='URL'
                  returnKeyType='done'
                  hasTVPreferredFocus
                  disabled={isAnyModalOpen}
                />
              </View>

              {/* Connect Button */}
              <View style={{ marginBottom: size(12) }}>
                <Button
                  onPress={() => handleConnect(serverURL)}
                  loading={loadingServerCheck}
                  disabled={loadingServerCheck || !serverURL.trim()}
                >
                  {t("server.connect_button")}
                </Button>
              </View>

              {/* Previous Servers */}
              <View style={{ paddingHorizontal: size(8) }}>
                <TVPreviousServersList
                  onServerSelect={(s) => handleConnect(s.address)}
                  onQuickLogin={handleQuickLoginWithSavedCredential}
                  onPasswordLogin={handlePasswordLogin}
                  onAddAccount={handleAddAccount}
                  onPinRequired={handlePinRequired}
                  onPasswordRequired={handlePasswordRequired}
                  onServerAction={handleServerAction}
                  loginServerOverride={loginTriggerServer}
                  disabled={isAnyModalOpen}
                />
              </View>
            </View>
          </ScrollView>
        )}
      </View>

      {/* Save Account Modal */}
      <TVSaveAccountModal
        visible={showSaveModal}
        onClose={() => {
          setShowSaveModal(false);
          setPendingLogin(null);
        }}
        onSave={handleSaveAccountConfirm}
        username={pendingLogin?.username || credentials.username}
      />

      {/* PIN Entry Modal */}
      <TVPINEntryModal
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
      <TVPasswordEntryModal
        visible={passwordModalVisible}
        onClose={() => {
          setPasswordModalVisible(false);
          setSelectedAccount(null);
          setSelectedServer(null);
        }}
        onSubmit={handlePasswordSubmit}
        username={selectedAccount?.username || ""}
      />

      {/* Server Action Sheet */}
      <TVServerActionSheet
        key={actionSheetKey}
        visible={showServerActionSheet}
        server={actionSheetServer}
        onLogin={handleServerActionLogin}
        onDelete={handleServerActionDelete}
        onClose={() => setShowServerActionSheet(false)}
      />
    </View>
  );
};
