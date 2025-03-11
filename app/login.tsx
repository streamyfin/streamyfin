import { Button } from "@/components/Button";
import { Input } from "@/components/common/Input";
import { Text } from "@/components/common/Text";
import { TVFocusable } from "@/components/common/TVFocusable";
import { TVButton } from "@/components/TVButton";
import { TVInput } from "@/components/TVInput";
import JellyfinServerDiscovery from "@/components/JellyfinServerDiscovery";
import { PreviousServersList } from "@/components/PreviousServersList";
import { Colors } from "@/constants/Colors";
import { apiAtom, useJellyfin } from "@/providers/JellyfinProvider";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { PublicSystemInfo } from "@jellyfin/sdk/lib/generated-client";
import { Image } from "expo-image";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { useAtom, useAtomValue } from "jotai";
import React, { useCallback, useEffect, useState, useRef } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  TouchableOpacity,
  View,
  TextInput,
  Keyboard,
} from "react-native";

import { z } from "zod";
import { t } from "i18next";
const CredentialsSchema = z.object({
  username: z.string().min(1, t("login.username_required")),
});

const Login: React.FC = () => {
  const api = useAtomValue(apiAtom);
  const navigation = useNavigation();
  const params = useLocalSearchParams();
  const { setServer, login, removeServer, initiateQuickConnect } =
    useJellyfin();

  // Refs for TV navigation
  const serverUrlInputRef = useRef<TextInput>(null);
  const connectButtonRef = useRef<any>(null);
  const usernameInputRef = useRef<TextInput>(null);
  const passwordInputRef = useRef<TextInput>(null);
  const loginButtonRef = useRef<any>(null);
  const quickConnectButtonRef = useRef<any>(null);

  const {
    apiUrl: _apiUrl,
    username: _username,
    password: _password,
  } = params as { apiUrl: string; username: string; password: string };

  const [loadingServerCheck, setLoadingServerCheck] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [serverURL, setServerURL] = useState<string>(_apiUrl);
  const [serverName, setServerName] = useState<string>("");
  const [credentials, setCredentials] = useState<{
    username: string;
    password: string;
  }>({
    username: _username,
    password: _password,
  });

  /**
   * A way to auto login based on a link
   */
  useEffect(() => {
    (async () => {
      if (_apiUrl) {
        setServer({
          address: _apiUrl,
        });

        setTimeout(() => {
          if (_username && _password) {
            setCredentials({ username: _username, password: _password });
            login(_username, _password);
          }
        }, 300);
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
            className="flex flex-row items-center"
          >
            <Ionicons name="chevron-back" size={18} color={Colors.primary} />
            <Text className="ml-2 text-purple-600">
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
          t("login.an_unexpected_error_occured")
        );
      }
    } finally {
      setLoading(false);
    }
  };

  /**
   * Checks the availability and validity of a Jellyfin server URL.
   */
  const checkUrl = useCallback(async (url: string) => {
    setLoadingServerCheck(true);

    try {
      const response = await fetch(`${url}/System/Info/Public`, {
        mode: "cors",
      });

      if (response.ok) {
        const data = (await response.json()) as PublicSystemInfo;

        setServerName(data.ServerName || "");
        return url;
      }

      return undefined;
    } catch {
      return undefined;
    } finally {
      setLoadingServerCheck(false);
    }
  }, []);

  /**
   * Handles the connection attempt to a Jellyfin server.
   */
  const handleConnect = useCallback(async (url: string) => {
    url = url.trim().replace(/\/$/, "");
    const result = await checkUrl(url);

    if (result === undefined) {
      Alert.alert(
        t("login.connection_failed"),
        t("login.could_not_connect_to_server")
      );
      return;
    }

    setServer({ address: url });
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
          ]
        );
      }
    } catch (error) {
      Alert.alert(
        t("login.error_title"),
        t("login.failed_to_initiate_quick_connect")
      );
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, paddingBottom: 16 }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {api?.basePath ? (
          <>
            <View className="flex flex-col h-full relative items-center justify-center">
              <View className="px-4 -mt-20 w-full">
                <View className="flex flex-col space-y-2">
                  <Text className="text-2xl font-bold -mb-2">
                    <>
                      {serverName ? (
                        <>
                          {t("login.login_to_title") + " "}
                          <Text className="text-purple-600">{serverName}</Text>
                        </>
                      ) : (
                        t("login.login_title")
                      )}
                    </>
                  </Text>
                  <Text className="text-xs text-neutral-400">
                    {api.basePath}
                  </Text>
                  <TVInput
                    ref={usernameInputRef}
                    placeholder={t("login.username_placeholder")}
                    onChangeText={(text) =>
                      setCredentials({ ...credentials, username: text })
                    }
                    value={credentials.username}
                    secureTextEntry={false}
                    keyboardType="default"
                    returnKeyType="next"
                    autoCapitalize="none"
                    textContentType="username"
                    clearButtonMode="while-editing"
                    maxLength={500}
                    hasTVPreferredFocus={true}
                    onSubmitEditing={() => {
                      passwordInputRef.current?.focus();
                    }}
                  />

                  <TVInput
                    ref={passwordInputRef}
                    placeholder={t("login.password_placeholder")}
                    onChangeText={(text) =>
                      setCredentials({ ...credentials, password: text })
                    }
                    value={credentials.password}
                    secureTextEntry
                    keyboardType="default"
                    returnKeyType="done"
                    autoCapitalize="none"
                    textContentType="password"
                    clearButtonMode="while-editing"
                    maxLength={500}
                    onSubmitEditing={handleLogin}
                  />
                  <View className="flex flex-row items-center justify-between">
                    <TVButton
                      ref={loginButtonRef}
                      onPress={handleLogin}
                      loading={loading}
                      className="flex-1 mr-2"
                    >
                      {t("login.login_button")}
                    </TVButton>
                    <TVFocusable
                      ref={quickConnectButtonRef}
                      onSelect={handleQuickConnect}
                    >
                      <View className="p-2 bg-neutral-900 rounded-xl h-12 w-12 flex items-center justify-center">
                        <MaterialCommunityIcons
                          name="cellphone-lock"
                          size={24}
                          color="white"
                        />
                      </View>
                    </TVFocusable>
                  </View>
                </View>
              </View>

              <View className="absolute bottom-0 left-0 w-full px-4 mb-2"></View>
            </View>
          </>
        ) : (
          <>
            <View className="flex flex-col h-full items-center justify-center w-full">
              <View className="flex flex-col gap-y-2 px-4 w-full -mt-36">
                <Image
                  style={{
                    width: 100,
                    height: 100,
                    marginLeft: -23,
                    marginBottom: -20,
                  }}
                  source={require("@/assets/images/StreamyFinFinal.png")}
                />
                <Text className="text-3xl font-bold">Streamyfin</Text>
                <Text className="text-neutral-500">
                  {t("server.enter_url_to_jellyfin_server")}
                </Text>
                <TVInput
                  ref={serverUrlInputRef}
                  hasTVPreferredFocus={true}
                  aria-label="Server URL"
                  placeholder={t("server.server_url_placeholder")}
                  onChangeText={setServerURL}
                  value={serverURL}
                  keyboardType="url"
                  returnKeyType="done"
                  autoCapitalize="none"
                  textContentType="URL"
                  maxLength={500}
                  onSubmitEditing={() => handleConnect(serverURL)}
                />
                <TVButton
                  ref={connectButtonRef}
                  loading={loadingServerCheck}
                  disabled={loadingServerCheck}
                  onPress={async () => {
                    await handleConnect(serverURL);
                  }}
                  className="w-full grow"
                >
                  {t("server.connect_button")}
                </TVButton>
                <TVFocusable>
                  <JellyfinServerDiscovery
                    onServerSelect={(server) => {
                      setServerURL(server.address);
                      if (server.serverName) {
                        setServerName(server.serverName);
                      }
                      handleConnect(server.address);
                    }}
                  />
                </TVFocusable>
                <TVFocusable>
                  <PreviousServersList
                    onServerSelect={(s) => {
                      handleConnect(s.address);
                    }}
                  />
                </TVFocusable>
              </View>
            </View>
          </>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default Login;