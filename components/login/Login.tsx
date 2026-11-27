import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import axios from "axios";
import { Image } from "expo-image";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { t } from "i18next";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  AppState,
  Keyboard,
  KeyboardAvoidingView,
  type NativeEventSubscription,
  Platform,
  Switch,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { toast } from "sonner-native";
import { Button } from "@/components/Button";
import { HeaderButton } from "@/components/common/HeaderButton";
import { HeaderIcon } from "@/components/common/HeaderIcon";
import { Input } from "@/components/common/Input";
import { Text } from "@/components/common/Text";
import JellyfinServerDiscovery from "@/components/JellyfinServerDiscovery";
import { QuickConnectCodeModal } from "@/components/login/QuickConnectCodeModal";
import { PreviousServersList } from "@/components/PreviousServersList";
import { CustomHeaderSheet } from "@/components/settings/CustomHeaderSheet";
import { Colors } from "@/constants/Colors";
import { QUICK_CONNECT_BROWSER_REOPEN_DELAY_MS } from "@/constants/QuickConnect";
import { useGlobalModal } from "@/providers/GlobalModalProvider";
import {
  apiAtom,
  pendingAccountSaveAtom,
  useJellyfin,
  userAtom,
} from "@/providers/JellyfinProvider";
import { type CustomHeader, usableCustomHeaders } from "@/utils/customHeaders";
import {
  checkJellyfinServer,
  ServerTooOldError,
} from "@/utils/jellyfin/checkServer";
import { quickConnectPairingUrl } from "@/utils/quickConnectPairing";
import type { SavedServer } from "@/utils/secureCredentials";

// TV has no browser; its login shows a QR code for the same page instead.
const WebBrowser = !Platform.isTV ? require("expo-web-browser") : null;

// Resolves once the browser is gone, true when the user closed it. Android
// answers "opened" right away, so there the app coming back to the front
// stands in for the close, as in expo-web-browser's own auth session. The
// signal drops that wait when the login screen goes away.
const browserClosedByUser = async (
  url: string,
  signal: AbortSignal,
): Promise<boolean> => {
  if (Platform.OS !== "android") {
    const { type } = await WebBrowser.openBrowserAsync(url);
    return type === "cancel";
  }
  // Subscribed before the browser opens, so the trip away is never missed.
  let left = false;
  let subscription!: NativeEventSubscription;
  const back = new Promise<void>((resolve) => {
    subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") left = true;
      else if (left) resolve();
    });
  });
  const stop = () => subscription.remove();
  signal.addEventListener("abort", stop);
  try {
    await WebBrowser.openBrowserAsync(url);
    await back;
  } finally {
    stop();
    signal.removeEventListener("abort", stop);
  }
  return true;
};

export const Login: React.FC = () => {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const navigation = useNavigation();
  const params = useLocalSearchParams();
  const {
    setServer,
    login,
    removeServer,
    initiateQuickConnect,
    isQuickConnectApproved,
    quickConnectStatus,
    stopQuickConnectPolling,
    loginWithSavedCredential,
    loginWithPassword,
  } = useJellyfin();
  const setPendingAccountSave = useSetAtom(pendingAccountSaveAtom);

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

  // Custom proxy auth headers entered before connecting. Passing `undefined`
  // keeps whatever is already saved for the server (see checkJellyfinServer),
  // so half-filled rows — a preset added but not typed into — can never
  // overwrite a saved server's working headers. Clearing them is done from
  // Settings → Network.
  const [pendingHeaders, setPendingHeaders] = useState<CustomHeader[]>([]);
  const usableHeaders = usableCustomHeaders(pendingHeaders);
  const connectHeaders = usableHeaders.length > 0 ? usableHeaders : undefined;

  const { showModal, hideModal } = useGlobalModal();
  const openHeaderSheet = useCallback(() => {
    showModal(
      <CustomHeaderSheet
        initialHeaders={pendingHeaders}
        onChange={setPendingHeaders}
        onClose={hideModal}
      />,
    );
  }, [pendingHeaders, showModal, hideModal]);

  // Quick Connect code shown in the in-app sheet while polling for authorization
  const [quickConnectCode, setQuickConnectCode] = useState<string | null>(null);
  // Tracks an in-flight Quick Connect attempt (code issued, provider polling).
  const [quickConnectActive, setQuickConnectActive] = useState(false);

  // Close the code sheet as soon as the session is authorized — the native
  // Alert used before had no programmatic dismiss and stayed open after login.
  // Same for the browser it was approved in. Only iOS can close one, and it
  // rejects when none is open, as after a password login.
  useEffect(() => {
    if (!user) return;
    setQuickConnectCode(null);
    WebBrowser?.dismissBrowser()?.catch(() => {});
  }, [user]);

  // Stop Quick Connect polling when leaving the login page (parity with TVLogin)
  useEffect(() => {
    return () => {
      stopQuickConnectPolling();
    };
  }, [stopQuickConnectPolling]);

  // Going back to server selection keeps this component mounted (same screen,
  // different state), so the unmount cleanup above doesn't run. Without this a
  // code authorized after leaving would silently log the user in later.
  useEffect(() => {
    if (!api?.basePath) {
      stopQuickConnectPolling();
      setQuickConnectCode(null);
      setQuickConnectActive(false);
    }
  }, [api?.basePath, stopQuickConnectPolling]);

  // Save account state — only the intent lives here; the protection picker is
  // the global PendingAccountSaveModal, shown after the login succeeds.
  const [saveAccount, setSaveAccount] = useState(false);

  useEffect(() => {
    if (quickConnectStatus === "expired" || quickConnectStatus === "disabled") {
      setQuickConnectActive(false);
    }
  }, [quickConnectStatus]);

  // A Quick Connect login with "save account" on flags the post-login save:
  // the protection picker shows globally once the session exists (this screen
  // unmounts on login, so it can't host the modal).
  useEffect(() => {
    if (user) {
      if (quickConnectActive && saveAccount) {
        setPendingAccountSave({ serverName });
      }
      setQuickConnectActive(false);
    }
  }, [user]);

  // Handle URL params for server connection
  useEffect(() => {
    (async () => {
      if (_apiUrl) {
        await setServer({
          address: _apiUrl,
        });
      }
    })();
  }, [_apiUrl]);

  // Handle auto-login when api is ready and credentials are provided via URL params
  useEffect(() => {
    if (api?.basePath && _apiUrl && _username && _password) {
      setCredentials({ username: _username, password: _password });
      login(_username, _password);
    }
  }, [api?.basePath, _apiUrl, _username, _password]);

  useEffect(() => {
    navigation.setOptions({
      headerTitle: serverName,
      headerLeft: () =>
        api?.basePath ? (
          <HeaderButton
            placement='left'
            variant='text'
            onPress={() => {
              removeServer();
            }}
            style={{ flexDirection: "row", gap: 4 }}
          >
            <HeaderIcon name='back' tintColor={Colors.primary} size={18} />
            <Text className='text-purple-600'>{t("login.change_server")}</Text>
          </HeaderButton>
        ) : null,
    });
  }, [serverName, navigation, api?.basePath]);

  const handleLogin = async () => {
    Keyboard.dismiss();

    // The button is already disabled without a username.
    if (!credentials.username.trim()) return;

    const ok = await performLogin(credentials.username, credentials.password);
    // The protection picker shows AFTER a successful login (global modal) —
    // never for a failed one.
    if (ok && saveAccount) {
      setPendingAccountSave({ serverName });
    }
  };

  const performLogin = async (
    username: string,
    password: string,
  ): Promise<boolean> => {
    setLoading(true);
    try {
      await login(username, password, serverName);
      return true;
    } catch (error) {
      if (error instanceof Error) {
        Alert.alert(t("login.connection_failed"), error.message);
      } else {
        Alert.alert(
          t("login.connection_failed"),
          t("login.an_unexpected_error_occurred"),
        );
      }
      return false;
    } finally {
      setLoading(false);
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
      } catch (e) {
        if (e instanceof ServerTooOldError) {
          Alert.alert(
            t("login.too_old_server_text"),
            t("login.too_old_server_description"),
          );
        }
      } finally {
        setLoadingServerCheck(false);
      }
    },
    [setServer],
  );

  // One start at a time, and only the latest counts, as on TV: closing the
  // sheet while a new code is on its way leaves that start behind.
  const startingRef = useRef(false);
  const startRef = useRef(0);

  // Once the login screen is gone, the browser must not open over the next one.
  const leftRef = useRef(new AbortController());
  useEffect(() => {
    const left = new AbortController();
    leftRef.current = left;
    return () => left.abort();
  }, []);

  // The browser flow reads the status after awaits, so it needs the latest one.
  const quickConnectStatusRef = useRef(quickConnectStatus);
  quickConnectStatusRef.current = quickConnectStatus;
  // Only the latest start may open the browser, and only while its code waits.
  const stillWaiting = (start: number) =>
    !leftRef.current.signal.aborted &&
    start === startRef.current &&
    quickConnectStatusRef.current === "waiting";

  // Approve the code on the server's own web page, so whatever it signs in
  // with (password, SSO, passkeys) works without the app knowing about it.
  const approveInBrowser = async (
    code: string,
    start: number,
    reopen = true,
  ) => {
    const left = leftRef.current.signal;
    if (!api?.basePath || left.aborted) return;
    const url = quickConnectPairingUrl(api.basePath, code);
    try {
      if (!(await browserClosedByUser(url, left))) return;
    } catch {
      toast.error(t("custom_links.could_not_open_link"));
      return;
    }
    // Let iOS finish animating the old browser away, then ask the server
    // instead of trusting the last poll, whose answer may still be on its way:
    // a browser reopened after the approval is one Android can't close.
    await new Promise((resolve) =>
      setTimeout(resolve, QUICK_CONNECT_BROWSER_REOPEN_DELAY_MS),
    );
    const approved = await isQuickConnectApproved();
    if (approved || !stillWaiting(start)) return;
    // SSO plugins land on the home page after signing in, so the code page is
    // gone by the time the browser is closed: it opens once more on its own,
    // signed in by now. After that, or when the server can't say, the user
    // decides, so it never loops.
    if (reopen && approved === false)
      return approveInBrowser(code, start, false);
    toast.info(t("login.browser_not_finished"), {
      action: {
        label: t("common.continue"),
        onClick: () => {
          if (stillWaiting(start)) void approveInBrowser(code, start, false);
        },
      },
    });
  };

  // "code" shows the code for another device, "browser" approves it here.
  const handleQuickConnect = async (via: "code" | "browser" = "code") => {
    if (startingRef.current) return;
    startingRef.current = true;
    const start = ++startRef.current;
    try {
      const code = await initiateQuickConnect();
      // Nobody sees a code asked for from a sheet closed since.
      if (start !== startRef.current) {
        stopQuickConnectPolling();
        return;
      }
      if (code) {
        setQuickConnectActive(true);
        if (via === "browser") await approveInBrowser(code, start);
        else setQuickConnectCode(code);
      }
    } catch (error) {
      if (start !== startRef.current) return;
      // Jellyfin refuses to start one with a 401 while it is turned off.
      Alert.alert(
        t("login.error_title"),
        axios.isAxiosError(error) && error.response?.status === 401
          ? t("companion_login.error_quick_connect_disabled", {
              server: serverName || api?.basePath,
            })
          : t("login.failed_to_initiate_quick_connect"),
      );
    } finally {
      startingRef.current = false;
    }
  };

  // Closing a code leaves its polling running, so it can still be approved
  // from another device; closing while a new one is on its way drops that one.
  const closeQuickConnectSheet = () => {
    if (startingRef.current) startRef.current++;
    setQuickConnectCode(null);
  };

  return (
    <SafeAreaView style={{ flex: 1, paddingBottom: 16 }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        {api?.basePath ? (
          <View className='flex flex-col flex-1 justify-center'>
            <View className='px-4 w-full'>
              <View className='flex flex-col space-y-2'>
                <Text className='text-2xl font-bold -mb-2'>
                  {serverName ? (
                    <>
                      {`${t("login.login_to_title")} `}
                      <Text className='text-purple-600'>{serverName}</Text>
                    </>
                  ) : (
                    t("login.login_title")
                  )}
                </Text>
                <Text className='text-xs text-neutral-400'>{api.basePath}</Text>
                <Input
                  placeholder={t("login.username_placeholder")}
                  onChangeText={(text) =>
                    setCredentials((prev) => ({ ...prev, username: text }))
                  }
                  onEndEditing={(e) => {
                    const newValue = e.nativeEvent.text;
                    if (newValue && newValue !== credentials.username) {
                      setCredentials((prev) => ({
                        ...prev,
                        username: newValue,
                      }));
                    }
                  }}
                  value={credentials.username}
                  keyboardType='default'
                  returnKeyType='done'
                  autoCapitalize='none'
                  autoCorrect={false}
                  textContentType='username'
                  clearButtonMode='while-editing'
                  maxLength={500}
                />

                <Input
                  placeholder={t("login.password_placeholder")}
                  onChangeText={(text) =>
                    setCredentials((prev) => ({ ...prev, password: text }))
                  }
                  onEndEditing={(e) => {
                    const newValue = e.nativeEvent.text;
                    if (newValue && newValue !== credentials.password) {
                      setCredentials((prev) => ({
                        ...prev,
                        password: newValue,
                      }));
                    }
                  }}
                  value={credentials.password}
                  secureTextEntry
                  keyboardType='default'
                  returnKeyType='done'
                  autoCapitalize='none'
                  textContentType='password'
                  clearButtonMode='while-editing'
                  maxLength={500}
                />
                <TouchableOpacity
                  onPress={() => setSaveAccount(!saveAccount)}
                  className='flex flex-row items-center py-2'
                  activeOpacity={0.7}
                >
                  <Switch
                    value={saveAccount}
                    onValueChange={setSaveAccount}
                    trackColor={{ false: "#3f3f46", true: Colors.primary }}
                    thumbColor='white'
                  />
                  <Text className='ml-3 text-neutral-300'>
                    {t("save_account.save_for_later")}
                  </Text>
                </TouchableOpacity>
                <View className='flex flex-row items-center justify-between'>
                  <Button
                    onPress={handleLogin}
                    loading={loading}
                    disabled={!credentials.username.trim()}
                    className='flex-1 mr-2'
                  >
                    {t("login.login_button")}
                  </Button>
                  <TouchableOpacity
                    onPress={() => handleQuickConnect("code")}
                    className='p-2 bg-neutral-900 rounded-xl h-12 w-12 flex items-center justify-center'
                  >
                    <MaterialCommunityIcons
                      name='cellphone-lock'
                      size={24}
                      color='white'
                    />
                  </TouchableOpacity>
                </View>
                {WebBrowser && (
                  <TouchableOpacity
                    onPress={() => handleQuickConnect("browser")}
                    className='flex flex-row items-center justify-center py-3 mr-14'
                    activeOpacity={0.7}
                  >
                    <MaterialCommunityIcons
                      name='web'
                      size={18}
                      color={Colors.primary}
                    />
                    <Text className='ml-2 text-purple-600'>
                      {t("login.login_with_browser")}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <View className='absolute bottom-0 left-0 w-full px-4 mb-2' />
          </View>
        ) : (
          <View className='flex flex-col flex-1 items-center justify-center w-full'>
            <View className='flex flex-col gap-y-2 px-4 w-full -mt-36'>
              <Image
                style={{
                  width: 100,
                  height: 100,
                  marginLeft: -23,
                  marginBottom: -20,
                }}
                source={require("@/assets/images/icon-ios-plain.png")}
              />
              <Text className='text-3xl font-bold'>Streamyfin</Text>
              <Text className='text-neutral-500'>
                {t("server.enter_url_to_jellyfin_server")}
              </Text>
              <Input
                testID='login-server-url'
                aria-label={t("server.server_url")}
                placeholder={t("server.server_url_placeholder")}
                onChangeText={setServerURL}
                value={serverURL}
                keyboardType='url'
                returnKeyType='done'
                autoCapitalize='none'
                textContentType='URL'
                maxLength={500}
              />
              <Button
                testID='login-connect'
                loading={loadingServerCheck}
                disabled={loadingServerCheck}
                onPress={async () => {
                  await handleConnect(serverURL, connectHeaders);
                }}
                className='w-full grow'
              >
                {t("server.connect_button")}
              </Button>

              {/* Servers behind an access gateway need their headers before
                  the very first request, so they are configured here. */}
              <TouchableOpacity
                onPress={openHeaderSheet}
                className='flex flex-row items-center justify-between py-3'
                activeOpacity={0.7}
              >
                <Text className='text-purple-600'>
                  {t("custom_headers.advanced_title")}
                </Text>
                <View className='flex flex-row items-center'>
                  <Text className='text-xs text-neutral-400 mr-1'>
                    {usableHeaders.length > 0
                      ? t("custom_headers.header_count", {
                          count: usableHeaders.length,
                        })
                      : t("custom_headers.source_none")}
                  </Text>
                  <Ionicons
                    name='chevron-forward'
                    size={18}
                    color={Colors.primary}
                  />
                </View>
              </TouchableOpacity>

              {/* The headers above belong to the URL that was typed with them.
                  A server picked from a list connects with its own saved ones —
                  passing these would overwrite them. */}
              <JellyfinServerDiscovery
                onServerSelect={async (server) => {
                  setServerURL(server.address);
                  if (server.serverName) {
                    setServerName(server.serverName);
                  }
                  await handleConnect(server.address);
                }}
              />
              <PreviousServersList
                onServerSelect={async (s) => {
                  await handleConnect(s.address);
                }}
                onQuickLogin={handleQuickLoginWithSavedCredential}
                onPasswordLogin={handlePasswordLogin}
                onAddAccount={handleAddAccount}
              />
            </View>
          </View>
        )}
      </KeyboardAvoidingView>

      {/* Dismissing only hides the code — polling continues so the login still
          completes if the code is authorized from another device afterwards. */}
      <QuickConnectCodeModal
        code={quickConnectCode}
        status={quickConnectStatus}
        serverName={serverName || api?.basePath || ""}
        onNewCode={() => handleQuickConnect("code")}
        onClose={closeQuickConnectSheet}
      />
    </SafeAreaView>
  );
};
