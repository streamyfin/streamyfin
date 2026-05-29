import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import type { PublicSystemInfo } from "@jellyfin/sdk/lib/generated-client";
import { Image } from "expo-image";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { t } from "i18next";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Switch,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { z } from "zod";
import { Button } from "@/components/Button";
import { Input } from "@/components/common/Input";
import { Text } from "@/components/common/Text";
import JellyfinServerDiscovery from "@/components/JellyfinServerDiscovery";
import { PreviousServersList } from "@/components/PreviousServersList";
import { SaveAccountModal } from "@/components/SaveAccountModal";
import { Colors } from "@/constants/Colors";
import { apiAtom, useJellyfin } from "@/providers/JellyfinProvider";
import { HEADER_PRESETS } from "@/utils/customHeaderPresets";
import type {
  AccountSecurityType,
  CustomHeader,
  SavedServer,
} from "@/utils/secureCredentials";
import {
  getServerCustomHeaders,
  updateServerCustomHeaders,
} from "@/utils/secureCredentials";

const CredentialsSchema = z.object({
  username: z.string().min(1, t("login.username_required")),
});

export const Login: React.FC = () => {
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

  // Custom headers state
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [pendingHeaders, setPendingHeaders] = useState<CustomHeader[]>([]);

  // Save account state
  const [saveAccount, setSaveAccount] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [pendingLogin, setPendingLogin] = useState<{
    username: string;
    password: string;
  } | null>(null);

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
          <TouchableOpacity
            onPress={() => {
              removeServer();
            }}
            className='flex flex-row items-center pr-2 pl-1'
          >
            <Ionicons name='chevron-back' size={18} color={Colors.primary} />
            <Text className=' ml-1 text-purple-600'>
              {t("login.change_server")}
            </Text>
          </TouchableOpacity>
        ) : null,
    });
  }, [serverName, navigation, api?.basePath]);

  const handleLogin = async () => {
    Keyboard.dismiss();

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

  const checkUrl = useCallback(
    async (url: string, headers?: CustomHeader[]) => {
      setLoadingServerCheck(true);
      const baseUrl = url.replace(/^https?:\/\//i, "");
      const protocols = ["https", "http"];
      try {
        return checkHttp(baseUrl, protocols, headers);
      } catch (e) {
        if (e instanceof Error && e.message === "Server too old") {
          throw e;
        }
        return undefined;
      } finally {
        setLoadingServerCheck(false);
      }
    },
    [],
  );

  async function checkHttp(
    baseUrl: string,
    protocols: string[],
    customHeaders?: CustomHeader[],
  ) {
    for (const protocol of protocols) {
      try {
        const serverUrl = `${protocol}://${baseUrl}`;

        // Build headers: use customHeaders if provided, otherwise fall back to stored headers
        const headersToInject: Record<string, string> = {};
        const source = customHeaders ?? getServerCustomHeaders(serverUrl);
        for (const { key, value, enabled } of source) {
          const trimmedKey = key.trim();
          const trimmedValue = value.trim();
          if (enabled && trimmedKey) headersToInject[trimmedKey] = trimmedValue;
        }

        const response = await fetch(`${serverUrl}/System/Info/Public`, {
          mode: "cors",
          headers: headersToInject,
        });
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
          // Save headers after successful connection
          if (customHeaders && customHeaders.length > 0) {
            updateServerCustomHeaders(serverUrl, customHeaders);
          }
          setServerName(data.ServerName || "");
          return serverUrl;
        }
      } catch (e) {
        if (e instanceof Error && e.message === "Server too old") {
          throw e;
        }
      }
    }
    return undefined;
  }

  const handleConnect = useCallback(
    async (url: string, headers?: CustomHeader[]) => {
      url = url.trim().replace(/\/$/, "");
      try {
        const result = await checkUrl(url, headers);
        if (result === undefined) {
          Alert.alert(
            t("login.connection_failed"),
            t("login.could_not_connect_to_server"),
          );
          return;
        }
        await setServer({ address: result });
      } catch {}
    },
    [checkUrl, setServer],
  );

  const handleQuickConnect = async () => {
    try {
      const code = await initiateQuickConnect();
      if (code) {
        Alert.alert(
          t("login.quick_connect"),
          t("login.enter_code_to_login", { code: code }),
          [
            {
              text: t("login.got_it"),
            },
          ],
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
    <SafeAreaView style={{ flex: 1, paddingBottom: 16 }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        {api?.basePath ? (
          <ScrollView
            className='flex-1'
            keyboardShouldPersistTaps='handled'
            keyboardDismissMode='interactive'
          >
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
                  aria-label='Username'
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
                  aria-label='Password'
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
                    testID='login-button'
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
          </ScrollView>
        ) : (
          <ScrollView
            className='flex-1 w-full'
            keyboardShouldPersistTaps='handled'
            keyboardDismissMode='interactive'
          >
            <View className='flex flex-col gap-y-2 px-4 w-full'>
              <Image
                style={{
                  width: 100,
                  height: 100,
                  marginBottom: -20,
                  alignSelf: "center",
                }}
                source={require("@/assets/images/icon-ios-plain.png")}
              />
              <Text className='text-3xl font-bold'>Streamyfin</Text>
              <Text className='text-neutral-500'>
                {t("server.enter_url_to_jellyfin_server")}
              </Text>
              <Input
                aria-label='Server URL'
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
                testID='connect-button'
                loading={loadingServerCheck}
                disabled={loadingServerCheck}
                onPress={async () => {
                  await handleConnect(serverURL, pendingHeaders);
                }}
                className='w-full grow'
              >
                {t("server.connect_button")}
              </Button>

              {/* Advanced: Custom Headers */}
              <TouchableOpacity
                testID='advanced-custom-headers'
                onPress={() => setShowAdvanced(!showAdvanced)}
                className='flex flex-row items-center py-2'
                activeOpacity={0.7}
              >
                <Ionicons
                  name={showAdvanced ? "chevron-down" : "chevron-forward"}
                  size={18}
                  color={Colors.primary}
                />
                <Text className='ml-2 text-purple-600'>
                  {t("custom_headers.advanced_title")}
                </Text>
              </TouchableOpacity>

              {showAdvanced && (
                <View className='flex flex-col gap-y-2'>
                  {/* Preset selector */}
                  <View className='flex flex-row flex-wrap gap-2'>
                    {HEADER_PRESETS.map((preset) => (
                      <TouchableOpacity
                        key={preset.id}
                        onPress={() => setPendingHeaders(preset.headers)}
                        className='bg-neutral-800 rounded-lg px-3 py-2'
                      >
                        <Text className='text-xs text-neutral-300'>
                          {preset.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Header inputs */}
                  {pendingHeaders.map((header, index) => (
                    <View key={index} className='flex flex-col gap-y-1'>
                      <View className='flex flex-row items-center gap-x-2'>
                        <Input
                          testID={`header-key-${header.key}`}
                          placeholder={t(
                            "custom_headers.header_name_placeholder",
                          )}
                          value={header.key}
                          onChangeText={(text) => {
                            const updated = [...pendingHeaders];
                            updated[index] = { ...header, key: text };
                            setPendingHeaders(updated);
                          }}
                          className='flex-1'
                          autoCapitalize='none'
                          autoCorrect={false}
                        />
                        <Switch
                          value={header.enabled}
                          onValueChange={(val) => {
                            const updated = [...pendingHeaders];
                            updated[index] = { ...header, enabled: val };
                            setPendingHeaders(updated);
                          }}
                          trackColor={{
                            false: "#3f3f46",
                            true: Colors.primary,
                          }}
                          thumbColor='white'
                        />
                      </View>
                      <Input
                        testID={`header-value-${header.key}`}
                        placeholder={t(
                          "custom_headers.header_value_placeholder",
                        )}
                        value={header.value}
                        onChangeText={(text) => {
                          const updated = [...pendingHeaders];
                          updated[index] = { ...header, value: text };
                          setPendingHeaders(updated);
                        }}
                        autoCapitalize='none'
                        autoCorrect={false}
                      />
                    </View>
                  ))}

                  {/* Add header button */}
                  <TouchableOpacity
                    onPress={() =>
                      setPendingHeaders([
                        ...pendingHeaders,
                        { key: "", value: "", enabled: true },
                      ])
                    }
                    className='bg-neutral-800 rounded-lg p-3 items-center'
                  >
                    <Text className='text-purple-600'>
                      {t("custom_headers.add_header")}
                    </Text>
                  </TouchableOpacity>

                  {/* Clear headers */}
                  {pendingHeaders.length > 0 && (
                    <TouchableOpacity
                      onPress={() => setPendingHeaders([])}
                      className='bg-neutral-800 rounded-lg p-3 items-center'
                    >
                      <Text className='text-red-500'>
                        {t("custom_headers.clear_headers")}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              <JellyfinServerDiscovery
                onServerSelect={async (server) => {
                  setServerURL(server.address);
                  if (server.serverName) {
                    setServerName(server.serverName);
                  }
                  await handleConnect(server.address, pendingHeaders);
                }}
              />
            </View>
            <View className='px-4 pb-2'>
              <PreviousServersList
                onServerSelect={async (s) => {
                  await handleConnect(s.address, pendingHeaders);
                }}
                onQuickLogin={handleQuickLoginWithSavedCredential}
                onPasswordLogin={handlePasswordLogin}
                onAddAccount={handleAddAccount}
              />
            </View>
          </ScrollView>
        )}
      </KeyboardAvoidingView>

      <SaveAccountModal
        visible={showSaveModal}
        onClose={() => {
          setShowSaveModal(false);
          setPendingLogin(null);
        }}
        onSave={handleSaveAccountConfirm}
        username={pendingLogin?.username || credentials.username}
      />
    </SafeAreaView>
  );
};
