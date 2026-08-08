import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { PublicSystemInfo } from "@jellyfin/sdk/lib/generated-client";
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
import { Colors } from "@/constants/Colors";
import {
  apiAtom,
  pendingAccountSaveAtom,
  useJellyfin,
  userAtom,
} from "@/providers/JellyfinProvider";
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
          {
            mode: "cors",
          },
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
                  await handleConnect(serverURL);
                }}
                className='w-full grow'
              >
                {t("server.connect_button")}
              </Button>
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
