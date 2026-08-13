import { useLocalSearchParams, useNavigation } from "expo-router";
import { t } from "i18next";
import { useAtom, useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, View } from "react-native";
import { useMMKVString } from "react-native-mmkv";
import { Text } from "@/components/common/Text";
import { useTVMenuKeyInterception } from "@/hooks/useTVBackPress";
import {
  apiAtom,
  SessionExpiredError,
  useJellyfin,
} from "@/providers/JellyfinProvider";
import { selectedTVServerAtom } from "@/utils/atoms/selectedTVServer";
import type { CustomHeader } from "@/utils/customHeaders";
import {
  checkJellyfinServer,
  ServerTooOldError,
} from "@/utils/jellyfin/checkServer";
import { storage } from "@/utils/mmkv";
import {
  generatePairingCode,
  type PairingCredentials,
  startPairingListener,
} from "@/utils/pairingService";
import { scaleSize } from "@/utils/scaleSize";
import {
  type AccountSecurityType,
  getPreviousServers,
  hashPIN,
  removeServerFromList,
  type SavedServer,
  type SavedServerAccount,
  saveAccountCredential,
} from "@/utils/secureCredentials";
import { TVAddServerForm } from "./TVAddServerForm";
import { TVAddUserForm } from "./TVAddUserForm";
import { TVPasswordEntryModal } from "./TVPasswordEntryModal";
import { TVPINEntryModal } from "./TVPINEntryModal";
import { TVQRCodeDisplay } from "./TVQRCodeDisplay";
import { TVSaveAccountModal } from "./TVSaveAccountModal";
import { TVServerSelectionScreen } from "./TVServerSelectionScreen";
import { TVUserSelectionScreen } from "./TVUserSelectionScreen";

type TVLoginScreen =
  | "server-selection"
  | "qr-code-display"
  | "loading"
  | "user-selection"
  | "add-server"
  | "add-user";

export const TVLogin: React.FC = () => {
  const api = useAtomValue(apiAtom);
  const navigation = useNavigation();
  const params = useLocalSearchParams();
  const {
    setServer,
    login,
    removeServer,
    initiateQuickConnect,
    stopQuickConnectPolling,
    loginWithSavedCredential,
    loginWithPassword,
  } = useJellyfin();

  const {
    apiUrl: _apiUrl,
    username: _username,
    password: _password,
  } = params as { apiUrl: string; username: string; password: string };

  // Selected server persistence
  const [selectedTVServer, setSelectedTVServer] = useAtom(selectedTVServerAtom);
  const [_previousServers, setPreviousServers] =
    useMMKVString("previousServers");

  // Get current servers list
  const previousServers = useMemo(() => {
    try {
      return JSON.parse(_previousServers || "[]") as SavedServer[];
    } catch {
      return [];
    }
  }, [_previousServers]);

  // Current screen state
  const [currentScreen, setCurrentScreen] =
    useState<TVLoginScreen>("server-selection");
  // No interception on server-selection so that it can go back to home screen on tvOS
  useTVMenuKeyInterception(currentScreen !== "server-selection");

  // Current selected server for user selection screen
  const [currentServer, setCurrentServer] = useState<SavedServer | null>(null);
  const [serverName, setServerName] = useState<string>("");

  // Loading states
  const [loadingServerCheck, setLoadingServerCheck] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);

  // Save account state
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [pendingLogin, setPendingLogin] = useState<{
    username: string;
    password: string;
  } | null>(null);

  // PIN/Password entry for saved accounts
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [selectedAccount, setSelectedAccount] =
    useState<SavedServerAccount | null>(null);

  // Track if any modal is open to disable background focus
  const isAnyModalOpen =
    showSaveModal || pinModalVisible || passwordModalVisible;

  // Pairing state (companion login via phone)
  const [showPairingQR, setShowPairingQR] = useState(false);
  const [pairingCode, setPairingCode] = useState("");
  const [pendingPairingCredentials, setPendingPairingCredentials] = useState<{
    serverUrl: string;
    username: string;
    password: string;
  } | null>(null);
  // Ref to prevent double-handling when onSave and onClose both fire
  const pairingHandledRef = useRef(false);

  // Refresh servers list helper
  const refreshServers = () => {
    const servers = getPreviousServers();
    setPreviousServers(JSON.stringify(servers));
  };

  // Initialize on mount - check if we have a persisted server
  useEffect(() => {
    if (selectedTVServer) {
      // Find the full server data from previousServers
      const server = previousServers.find(
        (s) => s.address === selectedTVServer.address,
      );
      if (server) {
        setCurrentServer(server);
        setServerName(selectedTVServer.name || "");
        setCurrentScreen("user-selection");
      } else {
        // Server no longer exists, clear persistence
        setSelectedTVServer(null);
      }
    }
  }, []);

  // Stop Quick Connect polling when leaving the login page
  useEffect(() => {
    return () => {
      stopQuickConnectPolling();
      setShowPairingQR(false);
    };
  }, [stopQuickConnectPolling]);

  // Handle URL params for server connection
  useEffect(() => {
    (async () => {
      if (_apiUrl) {
        await setServer({ address: _apiUrl });
      }
    })();
  }, [_apiUrl]);

  // Handle auto-login when api is ready and credentials are provided via URL params
  useEffect(() => {
    if (api?.basePath && _apiUrl && _username && _password) {
      login(_username, _password);
    }
  }, [api?.basePath, _apiUrl, _username, _password]);

  // Update header
  useEffect(() => {
    navigation.setOptions({
      headerTitle: serverName,
      headerShown: false,
    });
  }, [serverName, navigation]);

  // Handle connecting to a new server
  const handleConnect = useCallback(
    async (url: string, headers?: CustomHeader[]) => {
      setLoadingServerCheck(true);
      try {
        const result = await checkJellyfinServer(
          url.trim().replace(/\/$/, ""),
          headers,
        );
        if (!result) {
          Alert.alert(
            t("login.connection_failed"),
            t("login.could_not_connect_to_server"),
          );
          return;
        }
        setServerName(result.name);
        await setServer({ address: result.url });

        // Update server list and get the new server data
        refreshServers();

        // Find or create server entry
        const servers = getPreviousServers();
        const server = servers.find((s) => s.address === result.url);

        if (server) {
          setCurrentServer(server);
          setSelectedTVServer({ address: result.url, name: result.name });
          setCurrentScreen("user-selection");
        }
      } catch (error) {
        if (error instanceof ServerTooOldError) {
          Alert.alert(
            t("login.too_old_server_text"),
            t("login.too_old_server_description"),
          );
          return;
        }
        if (__DEV__) console.error("[TVLogin] Error in handleConnect:", error);
      } finally {
        setLoadingServerCheck(false);
      }
    },
    [setServer, setSelectedTVServer],
  );

  // Handle selecting an existing server
  const handleServerSelect = (server: SavedServer) => {
    setCurrentServer(server);
    setServerName(server.name || "");
    setSelectedTVServer({ address: server.address, name: server.name });
    setCurrentScreen("user-selection");
  };

  // Handle changing server (back from user selection)
  const handleChangeServer = () => {
    setSelectedTVServer(null);
    setCurrentServer(null);
    setServerName("");
    removeServer();
    setCurrentScreen("server-selection");
  };

  // Handle deleting a server
  const handleDeleteServer = async (server: SavedServer) => {
    await removeServerFromList(server.address);
    refreshServers();
    // If we deleted the currently selected server, clear it
    if (selectedTVServer?.address === server.address) {
      setSelectedTVServer(null);
      setCurrentServer(null);
    }
  };

  // The account survives a rejected token, so offer a way back in. Quick
  // Connect first: typing a password on a remote is miserable.
  const handleSavedLoginError = (
    error: unknown,
    account: SavedServerAccount,
  ) => {
    if (!(error instanceof SessionExpiredError)) {
      Alert.alert(
        t("login.connection_failed"),
        error instanceof Error ? error.message : t("server.session_expired"),
        [
          {
            text: t("common.ok"),
            onPress: () => setCurrentScreen("user-selection"),
          },
        ],
      );
      return;
    }

    setSelectedAccount(account);
    Alert.alert(t("server.session_expired"), t("server.please_login_again"), [
      {
        text: t("common.cancel"),
        style: "cancel",
        onPress: () => setCurrentScreen("user-selection"),
      },
      {
        text: t("login.quick_connect"),
        // Quick Connect posts through the api, which the user-selection screen
        // has not created yet.
        onPress: async () => {
          setCurrentScreen("user-selection");
          if (currentServer) {
            await setServer({ address: currentServer.address });
          }
          await handleQuickConnect();
        },
      },
      {
        text: t("password.enter_password"),
        onPress: () => {
          setCurrentScreen("user-selection");
          setPasswordModalVisible(true);
        },
      },
    ]);
  };

  // Handle user selection
  const handleUserSelect = async (account: SavedServerAccount) => {
    if (!currentServer) return;

    switch (account.securityType) {
      case "none":
        setCurrentScreen("loading");
        setLoading(true);
        try {
          await loginWithSavedCredential(currentServer.address, account.userId);
        } catch (error) {
          handleSavedLoginError(error, account);
        } finally {
          setLoading(false);
        }
        break;

      case "pin":
        setSelectedAccount(account);
        setPinModalVisible(true);
        break;

      case "password":
        setSelectedAccount(account);
        setPasswordModalVisible(true);
        break;
    }
  };

  // Handle PIN success
  const handlePinSuccess = async () => {
    setPinModalVisible(false);
    if (currentServer && selectedAccount) {
      setCurrentScreen("loading");
      setLoading(true);
      try {
        await loginWithSavedCredential(
          currentServer.address,
          selectedAccount.userId,
        );
      } catch (error) {
        handleSavedLoginError(error, selectedAccount);
        return;
      } finally {
        setLoading(false);
      }
    }
    setSelectedAccount(null);
  };

  // Handle password submit
  const handlePasswordSubmit = async (password: string) => {
    if (currentServer && selectedAccount) {
      setCurrentScreen("loading");
      setLoading(true);
      try {
        await loginWithPassword(
          currentServer.address,
          selectedAccount.username,
          password,
        );
      } catch {
        Alert.alert(
          t("login.connection_failed"),
          t("login.invalid_username_or_password"),
          [
            {
              text: t("common.ok"),
              onPress: () => setCurrentScreen("user-selection"),
            },
          ],
        );
      } finally {
        setLoading(false);
      }
    }
    setPasswordModalVisible(false);
    setSelectedAccount(null);
  };

  // Handle forgot PIN
  const handleForgotPIN = async () => {
    setSelectedAccount(null);
    setPinModalVisible(false);
  };

  // Handle login with credentials (from add user form)
  const handleLogin = async (
    username: string,
    password: string,
    saveAccount: boolean,
  ) => {
    if (!currentServer) return;

    if (saveAccount) {
      setPendingLogin({ username, password });
      setShowSaveModal(true);
    } else {
      await performLogin(username, password);
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
          t("login.an_unexpected_error_occurred"),
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
    const pairingCreds = pendingPairingCredentials;

    if (pairingCreds) {
      // Pairing flow: mark as handled, login, then save credential
      pairingHandledRef.current = true;
      setPendingPairingCredentials(null);
      setPendingLogin(null);
      setLoading(true);
      try {
        await loginWithPassword(
          pairingCreds.serverUrl,
          pairingCreds.username,
          pairingCreds.password,
        );
        // Save credential after successful login
        try {
          const token = storage.getString("token");
          const userJson = storage.getString("user");
          const storedServerUrl = storage.getString("serverUrl");
          if (token && userJson && storedServerUrl) {
            const user = JSON.parse(userJson);
            let pinHash: string | undefined;
            if (securityType === "pin" && pinCode) {
              pinHash = await hashPIN(pinCode);
            }
            await saveAccountCredential({
              serverUrl: storedServerUrl,
              serverName: storedServerUrl,
              token,
              userId: user.Id || "",
              username: pairingCreds.username,
              savedAt: Date.now(),
              securityType,
              pinHash,
              primaryImageTag: user.PrimaryImageTag ?? undefined,
            });
          }
        } catch (saveError) {
          if (__DEV__)
            console.error(
              "[TVLogin] Failed to save pairing credential:",
              saveError,
            );
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : t("login.an_unexpected_error_occurred");
        Alert.alert(t("login.connection_failed"), message);
        goToQRScreen();
      } finally {
        setLoading(false);
      }
      return;
    }

    // Normal login flow
    if (pendingLogin && currentServer) {
      setLoading(true);
      try {
        await login(pendingLogin.username, pendingLogin.password, serverName, {
          saveAccount: true,
          securityType,
          pinCode,
        });
      } catch (error) {
        if (error instanceof Error) {
          Alert.alert(t("login.connection_failed"), error.message);
        } else {
          Alert.alert(
            t("login.connection_failed"),
            t("login.an_unexpected_error_occurred"),
          );
        }
      } finally {
        setLoading(false);
        setPendingLogin(null);
      }
    }
  };

  // Handle quick connect
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

  // Navigate to QR screen with a fresh code and active listener
  const goToQRScreen = useCallback(() => {
    const code = generatePairingCode();
    setPairingCode(code);
    setShowPairingQR(true);
    setCurrentScreen("qr-code-display");
  }, []);

  // Handle pairing with companion phone
  const handleStartPairing = useCallback(() => {
    goToQRScreen();
  }, [goToQRScreen]);

  // Handle credentials received from companion
  const handlePairingCredentials = useCallback(
    (credentials: PairingCredentials) => {
      setShowPairingQR(false);
      setCurrentScreen("loading");

      // Store credentials and show save modal (same UX as normal login)
      setPendingPairingCredentials({
        serverUrl: credentials.serverUrl,
        username: credentials.username,
        password: credentials.password,
      });
      setPendingLogin({
        username: credentials.username,
        password: credentials.password,
      });
      setShowSaveModal(true);
    },
    [],
  );

  // Listen for pairing credentials when QR is shown
  useEffect(() => {
    if (!showPairingQR || !pairingCode) return;

    const cleanup = startPairingListener(
      pairingCode,
      handlePairingCredentials,
      (error) => {
        if (__DEV__) console.error("[TVLogin] Pairing error:", error);
        setShowPairingQR(false);
        Alert.alert(t("login.error_title"), t("companion_login.error_generic"));
      },
    );

    // Auto-dismiss after 5 minutes
    const timeout = setTimeout(
      () => {
        setShowPairingQR(false);
      },
      5 * 60 * 1000,
    );

    return () => {
      cleanup();
      clearTimeout(timeout);
    };
  }, [showPairingQR, pairingCode, handlePairingCredentials]);

  // Render current screen
  const renderScreen = () => {
    // If API is connected but we're on server/user selection,
    // it means we need to show add-user form
    if (
      api?.basePath &&
      currentScreen !== "add-user" &&
      currentScreen !== "loading"
    ) {
      // API is ready, show add-user form
      return (
        <TVAddUserForm
          serverName={serverName}
          serverAddress={api.basePath}
          onLogin={handleLogin}
          onQuickConnect={handleQuickConnect}
          onBack={handleChangeServer}
          loading={loading}
          disabled={isAnyModalOpen}
        />
      );
    }

    switch (currentScreen) {
      case "server-selection":
        return (
          <TVServerSelectionScreen
            onServerSelect={handleServerSelect}
            onAddServer={() => setCurrentScreen("add-server")}
            onDeleteServer={handleDeleteServer}
            disabled={isAnyModalOpen}
          />
        );

      case "user-selection":
        if (!currentServer) {
          setCurrentScreen("server-selection");
          return null;
        }
        return (
          <TVUserSelectionScreen
            server={currentServer}
            onUserSelect={handleUserSelect}
            onAddUser={() => {
              // Set the server in JellyfinProvider and go to add-user
              setServer({ address: currentServer.address });
              setCurrentScreen("add-user");
            }}
            onChangeServer={handleChangeServer}
            disabled={isAnyModalOpen || loading}
          />
        );

      case "add-server":
        return (
          <TVAddServerForm
            onConnect={handleConnect}
            onStartPairing={handleStartPairing}
            onBack={() => setCurrentScreen("server-selection")}
            loading={loadingServerCheck}
            disabled={isAnyModalOpen}
          />
        );

      case "qr-code-display":
        return (
          <TVQRCodeDisplay
            code={pairingCode}
            onBack={() => {
              setShowPairingQR(false);
              setCurrentScreen("add-server");
            }}
          />
        );

      case "loading":
        return (
          <View
            style={{
              flex: 1,
              backgroundColor: "#000000",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontSize: scaleSize(24),
                fontWeight: "bold",
                color: "#FFFFFF",
                marginBottom: scaleSize(12),
              }}
            >
              {t("pairing.logging_in")}
            </Text>
            <Text
              style={{
                fontSize: scaleSize(16),
                color: "#9CA3AF",
              }}
            >
              {t("pairing.logging_in_description")}
            </Text>
          </View>
        );

      case "add-user":
        return (
          <TVAddUserForm
            serverName={serverName}
            serverAddress={currentServer?.address || api?.basePath || ""}
            onLogin={handleLogin}
            onQuickConnect={handleQuickConnect}
            onBack={() => {
              removeServer();
              setCurrentScreen("user-selection");
            }}
            loading={loading}
            disabled={isAnyModalOpen}
          />
        );

      default:
        return null;
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#000000" }}>
      <View style={{ flex: 1 }}>{renderScreen()}</View>

      {/* Save Account Modal */}
      <TVSaveAccountModal
        visible={showSaveModal}
        onClose={() => {
          // If onSave already handled this, just clean up
          if (pairingHandledRef.current) {
            pairingHandledRef.current = false;
            return;
          }
          setShowSaveModal(false);
          if (pendingPairingCredentials) {
            // Pairing: user dismissed without saving, login anyway
            const creds = pendingPairingCredentials;
            setPendingPairingCredentials(null);
            setPendingLogin(null);
            loginWithPassword(
              creds.serverUrl,
              creds.username,
              creds.password,
            ).catch((error) => {
              const message =
                error instanceof Error
                  ? error.message
                  : t("login.an_unexpected_error_occurred");
              Alert.alert(t("login.connection_failed"), message);
              goToQRScreen();
            });
            return;
          }
          setPendingLogin(null);
        }}
        onSave={handleSaveAccountConfirm}
        username={pendingLogin?.username || ""}
      />

      {/* PIN Entry Modal */}
      <TVPINEntryModal
        visible={pinModalVisible}
        onClose={() => {
          setPinModalVisible(false);
          setSelectedAccount(null);
        }}
        onSuccess={handlePinSuccess}
        onForgotPIN={handleForgotPIN}
        serverUrl={currentServer?.address || ""}
        userId={selectedAccount?.userId || ""}
        username={selectedAccount?.username || ""}
      />

      {/* Password Entry Modal */}
      <TVPasswordEntryModal
        visible={passwordModalVisible}
        onClose={() => {
          setPasswordModalVisible(false);
          setSelectedAccount(null);
        }}
        onSubmit={handlePasswordSubmit}
        username={selectedAccount?.username || ""}
      />
    </View>
  );
};
