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
import { Colors } from "@/constants/Colors";
import { apiAtom, useJellyfin } from "@/providers/JellyfinProvider";

const CredentialsSchema = z.object({
  username: z.string().min(1, t("login.username_required")),
});

const Login: React.FC = () => {
  const api = useAtomValue(apiAtom);
  const navigation = useNavigation();
  const params = useLocalSearchParams();
  const { setServer, login, removeServer, initiateQuickConnect } =
    useJellyfin();

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

  /**
   * A way to auto login based on a link
   */
  useEffect(() => {
    (async () => {
      if (_apiUrl) {
        await setServer({
          address: _apiUrl,
        });

        // Wait for server setup and state updates to complete
        setTimeout(() => {
          if (_username && _password) {
            setCredentials({ username: _username, password: _password });
            login(_username, _password);
          }
        }, 0);
      }
    })();
  }, [_apiUrl, _username, _password]);

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

    setLoading(true);
    try {
      const result = CredentialsSchema.safeParse(credentials);
      if (result.success) {
        await login(credentials.username, credentials.password);
      }
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
    }
  };

  /**
   * Checks the availability and validity of a Jellyfin server URL.
   *
   * This function attempts to connect to a Jellyfin server using the provided URL.
   * It tries both HTTPS and HTTP protocols, with a timeout to handle long 404 responses.
   *
   * @param {string} url - The base URL of the Jellyfin server to check.
   * @returns {Promise<string | undefined>} A Promise that resolves to:
   *   - The full URL (including protocol) if a valid Jellyfin server is found.
   *   - undefined if no valid server is found at the given URL.
   *
   * Side effects:
   * - Sets loadingServerCheck state to true at the beginning and false at the end.
   * - Logs errors and timeout information to the console.
   */
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
  /**
   * Handles the connection attempt to a Jellyfin server.
   *
   * This function trims the input URL, checks its validity using the `checkUrl` function,
   * and sets the server address if a valid connection is established.
   *
   * @param {string} url - The URL of the Jellyfin server to connect to.
   *
   * @returns {Promise<void>}
   *
   * Side effects:
   * - Calls `checkUrl` to validate the server URL.
   * - Shows an alert if the connection fails.
   * - Sets the server address using `setServer` if the connection is successful.
   *
   */
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

  return Platform.isTV ? (
    // TV layout
    <SafeAreaView className='flex-1 bg-black'>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        {api?.basePath ? (
          // ------------ Username/Password view ------------
          <View className='flex-1 items-center justify-center'>
            {/* Safe centered column with max width so TV doesn’t stretch too far */}
            <View className='w-[92%] max-w-[900px] px-2 -mt-12'>
              <Text className='text-3xl font-bold text-white mb-1'>
                {serverName ? (
                  <>
                    {`${t("login.login_to_title")} `}
                    <Text className='text-purple-500'>{serverName}</Text>
                  </>
                ) : (
                  t("login.login_title")
                )}
              </Text>
              <Text className='text-xs text-neutral-400 mb-6'>
                {api.basePath}
              </Text>

              {/* Username */}
              <Input
                placeholder={t("login.username_placeholder")}
                onChangeText={(text: string) =>
                  setCredentials({ ...credentials, username: text })
                }
                onEndEditing={(e) => {
                  const newValue = e.nativeEvent.text;
                  if (newValue && newValue !== credentials.username) {
                    setCredentials({ ...credentials, username: newValue });
                  }
                }}
                value={credentials.username}
                keyboardType='default'
                returnKeyType='done'
                autoCapitalize='none'
                textContentType='oneTimeCode'
                clearButtonMode='while-editing'
                maxLength={500}
                extraClassName='mb-4'
                autoFocus={false}
                blurOnSubmit={true}
              />

              {/* Password */}
              <Input
                placeholder={t("login.password_placeholder")}
                onChangeText={(text: string) =>
                  setCredentials({ ...credentials, password: text })
                }
                onEndEditing={(e) => {
                  const newValue = e.nativeEvent.text;
                  if (newValue && newValue !== credentials.password) {
                    setCredentials({ ...credentials, password: newValue });
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
                extraClassName='mb-4'
                autoFocus={false}
                blurOnSubmit={true}
              />

              <View className='mt-4'>
                <Button
                  onPress={handleLogin}
                  disabled={!credentials.username.trim()}
                >
                  {t("login.login_button")}
                </Button>
              </View>
              <View className='mt-3'>
                <Button
                  onPress={handleQuickConnect}
                  className='bg-neutral-800 border border-neutral-700'
                >
                  {t("login.quick_connect")}
                </Button>
              </View>
            </View>
          </View>
        ) : (
          // ------------ Server connect view ------------
          <View className='flex-1 items-center justify-center'>
            <View className='w-[92%] max-w-[900px] -mt-2'>
              <View className='items-center mb-1'>
                <Image
                  source={require("@/assets/images/icon-ios-plain.png")}
                  style={{ width: 110, height: 110 }}
                  contentFit='contain'
                />
              </View>

              <Text className='text-white text-4xl font-bold text-center'>
                Streamyfin
              </Text>
              <Text className='text-neutral-400 text-base text-left mt-2 mb-1'>
                {t("server.enter_url_to_jellyfin_server")}
              </Text>

              {/* Full-width Input with clear focus ring */}
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
                autoFocus={false}
                blurOnSubmit={true}
              />

              {/* Full-width primary button */}
              <View className='mt-4'>
                <Button
                  onPress={async () => {
                    await handleConnect(serverURL);
                  }}
                >
                  {t("server.connect_button")}
                </Button>
              </View>

              {/* Lists stay full width but inside max width container */}
              <View className='mt-2'>
                <JellyfinServerDiscovery
                  onServerSelect={async (server: any) => {
                    setServerURL(server.address);
                    if (server.serverName) setServerName(server.serverName);
                    await handleConnect(server.address);
                  }}
                />
                <PreviousServersList
                  onServerSelect={async (s: any) => {
                    await handleConnect(s.address);
                  }}
                />
              </View>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  ) : (
    // Mobile layout
    <SafeAreaView style={{ flex: 1, paddingBottom: 16 }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        {api?.basePath ? (
          <View className='flex flex-col flex-1 items-center justify-center'>
            <View className='px-4 -mt-20 w-full'>
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
                    setCredentials({ ...credentials, username: text })
                  }
                  onEndEditing={(e) => {
                    const newValue = e.nativeEvent.text;
                    if (newValue && newValue !== credentials.username) {
                      setCredentials({ ...credentials, username: newValue });
                    }
                  }}
                  value={credentials.username}
                  keyboardType='default'
                  returnKeyType='done'
                  autoCapitalize='none'
                  // Changed from username to oneTimeCode because it is a known issue in RN
                  // https://github.com/facebook/react-native/issues/47106#issuecomment-2521270037
                  textContentType='oneTimeCode'
                  clearButtonMode='while-editing'
                  maxLength={500}
                />

                <Input
                  placeholder={t("login.password_placeholder")}
                  onChangeText={(text) =>
                    setCredentials({ ...credentials, password: text })
                  }
                  onEndEditing={(e) => {
                    const newValue = e.nativeEvent.text;
                    if (newValue && newValue !== credentials.password) {
                      setCredentials({ ...credentials, password: newValue });
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
              />
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default Login;
