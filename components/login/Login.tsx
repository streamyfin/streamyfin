import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { t } from "i18next";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Switch,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { z } from "zod";
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
import type { SavedServer } from "@/utils/secureCredentials";

const CredentialsSchema = z.object({
  username: z.string().min(1, t("login.username_required")),
});

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

  // Close the code sheet as soon as the session is authorized — the native
  // Alert used before had no programmatic dismiss and stayed open after login.
  useEffect(() => {
    if (user) setQuickConnectCode(null);
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
    }
  }, [api?.basePath, stopQuickConnectPolling]);

  // Save account state — only the intent lives here; the protection picker is
  // the global PendingAccountSaveModal, shown after the login succeeds.
  const [saveAccount, setSaveAccount] = useState(false);

  // Tracks an in-flight Quick Connect attempt (code issued, provider polling).
  const [quickConnectActive, setQuickConnectActive] = useState(false);

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

    const result = CredentialsSchema.safeParse(credentials);
    if (!result.success) return;

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

  const handleQuickConnect = async () => {
    try {
      const code = await initiateQuickConnect();
      if (code) {
        setQuickConnectActive(true);
        setQuickConnectCode(code);
      }
    } catch (_error) {
      Alert.alert(
        t("login.error_title"),
        t("login.failed_to_initiate_quick_connect"),
      );
    }
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
                    onPress={handleQuickConnect}
                    className='p-2 bg-neutral-900 rounded-xl h-12 w-12 flex items-center justify-center'
                  >
                    <MaterialCommunityIcons
                      name='cellphone-lock'
                      size={24}
                      color='white'
                    />
                  </TouchableOpacity>
                </View>
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
        onClose={() => setQuickConnectCode(null)}
      />
    </SafeAreaView>
  );
};
