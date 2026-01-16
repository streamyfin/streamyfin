import { Ionicons } from "@expo/vector-icons";
import type { PublicSystemInfo } from "@jellyfin/sdk/lib/generated-client";
import { Image } from "expo-image";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { t } from "i18next";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useState } from "react";
import { Alert, KeyboardAvoidingView, Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { z } from "zod";
import { Button } from "@/components/Button";
import { Text } from "@/components/common/Text";
import { TVInput } from "@/components/login/TVInput";
import { TVPreviousServersList } from "@/components/login/TVPreviousServersList";
import { TVSaveAccountToggle } from "@/components/login/TVSaveAccountToggle";
import { TVServerCard } from "@/components/login/TVServerCard";
import { PasswordEntryModal } from "@/components/PasswordEntryModal";
import { PINEntryModal } from "@/components/PINEntryModal";
import { SaveAccountModal } from "@/components/SaveAccountModal";
import { Colors } from "@/constants/Colors";
import { useJellyfinDiscovery } from "@/hooks/useJellyfinDiscovery";
import { apiAtom, useJellyfin } from "@/providers/JellyfinProvider";
import type {
  AccountSecurityType,
  SavedServer,
  SavedServerAccount,
} from "@/utils/secureCredentials";

const CredentialsSchema = z.object({
  username: z.string().min(1, t("login.username_required")),
});

const TVLogin: React.FC = () => {
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

  // Server discovery
  const {
    servers: discoveredServers,
    isSearching,
    startDiscovery,
  } = useJellyfinDiscovery();

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
    try {
      const result = await checkUrl(url);
      if (result === undefined) {
        Alert.alert(
          t("login.connection_failed"),
          t("login.could_not_connect_to_server"),
        );
        return;
      }
      await setServer({ address: result });
    } catch {}
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#000000" }}>
      <KeyboardAvoidingView behavior='padding' style={{ flex: 1 }}>
        {api?.basePath ? (
          // ==================== CREDENTIALS SCREEN ====================
          <View
            style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
          >
            <View
              style={{ width: "100%", maxWidth: 800, paddingHorizontal: 40 }}
            >
              {/* Back Button */}
              <Pressable
                onPress={() => removeServer()}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginBottom: 40,
                }}
              >
                <Ionicons
                  name='chevron-back'
                  size={28}
                  color={Colors.primary}
                />
                <Text
                  style={{ color: Colors.primary, fontSize: 20, marginLeft: 4 }}
                >
                  {t("login.change_server")}
                </Text>
              </Pressable>

              {/* Title */}
              <Text
                style={{
                  fontSize: 48,
                  fontWeight: "bold",
                  color: "#FFFFFF",
                  marginBottom: 8,
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
                  fontSize: 18,
                  color: "#9CA3AF",
                  marginBottom: 40,
                }}
              >
                {api.basePath}
              </Text>

              {/* Username Input */}
              <View style={{ marginBottom: 16 }}>
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
                />
              </View>

              {/* Password Input */}
              <View style={{ marginBottom: 24 }}>
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
                />
              </View>

              {/* Save Account Toggle */}
              <View style={{ marginBottom: 32 }}>
                <TVSaveAccountToggle
                  value={saveAccount}
                  onValueChange={setSaveAccount}
                  label={t("save_account.save_for_later")}
                />
              </View>

              {/* Login Button */}
              <View style={{ marginBottom: 16 }}>
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
          </View>
        ) : (
          // ==================== SERVER SELECTION SCREEN ====================
          <View
            style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
          >
            <View
              style={{ width: "100%", maxWidth: 800, paddingHorizontal: 40 }}
            >
              {/* Logo */}
              <View style={{ alignItems: "center", marginBottom: 16 }}>
                <Image
                  source={require("@/assets/images/icon-ios-plain.png")}
                  style={{ width: 150, height: 150 }}
                  contentFit='contain'
                />
              </View>

              {/* Title */}
              <Text
                style={{
                  fontSize: 48,
                  fontWeight: "bold",
                  color: "#FFFFFF",
                  textAlign: "center",
                  marginBottom: 8,
                }}
              >
                Streamyfin
              </Text>
              <Text
                style={{
                  fontSize: 20,
                  color: "#9CA3AF",
                  textAlign: "center",
                  marginBottom: 32,
                }}
              >
                {t("server.enter_url_to_jellyfin_server")}
              </Text>

              {/* Server URL Input */}
              <View style={{ marginBottom: 24 }}>
                <TVInput
                  placeholder={t("server.server_url_placeholder")}
                  value={serverURL}
                  onChangeText={setServerURL}
                  keyboardType='url'
                  autoCapitalize='none'
                  textContentType='URL'
                  returnKeyType='done'
                  hasTVPreferredFocus
                />
              </View>

              {/* Connect Button */}
              <View style={{ marginBottom: 24 }}>
                <Button
                  onPress={() => handleConnect(serverURL)}
                  loading={loadingServerCheck}
                  disabled={loadingServerCheck || !serverURL.trim()}
                >
                  {t("server.connect_button")}
                </Button>
              </View>

              {/* Server Discovery */}
              <View style={{ marginBottom: 16 }}>
                <Button
                  onPress={startDiscovery}
                  color='black'
                  className='bg-neutral-800'
                >
                  {isSearching
                    ? t("server.searching")
                    : t("server.search_for_local_servers")}
                </Button>
              </View>

              {/* Discovered Servers */}
              {discoveredServers.length > 0 && (
                <View style={{ marginTop: 16, gap: 12 }}>
                  <Text
                    style={{
                      fontSize: 20,
                      fontWeight: "600",
                      color: "#9CA3AF",
                      marginBottom: 8,
                    }}
                  >
                    {t("server.servers")}
                  </Text>
                  {discoveredServers.map((server) => (
                    <TVServerCard
                      key={server.address}
                      title={server.serverName || server.address}
                      subtitle={server.serverName ? server.address : undefined}
                      onPress={() => {
                        setServerURL(server.address);
                        if (server.serverName) {
                          setServerName(server.serverName);
                        }
                        handleConnect(server.address);
                      }}
                    />
                  ))}
                </View>
              )}

              {/* Previous Servers */}
              <TVPreviousServersList
                onServerSelect={(s) => handleConnect(s.address)}
                onQuickLogin={handleQuickLoginWithSavedCredential}
                onPasswordLogin={handlePasswordLogin}
                onAddAccount={handleAddAccount}
                onPinRequired={handlePinRequired}
                onPasswordRequired={handlePasswordRequired}
              />
            </View>
          </View>
        )}
      </KeyboardAvoidingView>

      {/* Save Account Modal */}
      <SaveAccountModal
        visible={showSaveModal}
        onClose={() => {
          setShowSaveModal(false);
          setPendingLogin(null);
        }}
        onSave={handleSaveAccountConfirm}
        username={pendingLogin?.username || credentials.username}
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
    </SafeAreaView>
  );
};

export default TVLogin;
