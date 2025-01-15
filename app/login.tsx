import { Button } from "@/components/Button";
import { Input } from "@/components/common/Input";
import { Text } from "@/components/common/Text";
import JellyfinServerDiscovery from "@/components/JellyfinServerDiscovery";
import { PreviousServersList } from "@/components/PreviousServersList";
import { Colors } from "@/constants/Colors";
import { apiAtom, useJellyfin } from "@/providers/JellyfinProvider";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { PublicSystemInfo } from "@jellyfin/sdk/lib/generated-client";
import { Image } from "expo-image";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { useAtom } from "jotai";
import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  TouchableOpacity,
  View,
} from "react-native";

import { z } from "zod";

const CredentialsSchema = z.object({
  username: z.string().min(1, "Username is required"),
});

const Login: React.FC = () => {
  const { setServer, login, removeServer, initiateQuickConnect } =
    useJellyfin();
  const [api] = useAtom(apiAtom);
  const params = useLocalSearchParams();

  const {
    apiUrl: _apiUrl,
    username: _username,
    password: _password,
  } = params as { apiUrl: string; username: string; password: string };

  const [serverURL, setServerURL] = useState<string>(_apiUrl);
  const [serverName, setServerName] = useState<string>("");
  const [credentials, setCredentials] = useState<{
    username: string;
    password: string;
  }>({
    username: _username,
    password: _password,
  });

  useEffect(() => {
    (async () => {
      // we might re-use the checkUrl function here to check the url as well
      // however, I don't think it should be necessary for now
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

  const navigation = useNavigation();
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
            <Text className="ml-2 text-purple-600">Change server</Text>
          </TouchableOpacity>
        ) : null,
    });
  }, [serverName, navigation, api?.basePath]);

  const [loading, setLoading] = useState<boolean>(false);

  const handleLogin = async () => {
    setLoading(true);
    try {
      const result = CredentialsSchema.safeParse(credentials);
      if (result.success) {
        await login(credentials.username, credentials.password);
      }
    } catch (error) {
      if (error instanceof Error) {
        Alert.alert("Connection failed", error.message);
      } else {
        Alert.alert("Connection failed", "An unexpected error occurred");
      }
    } finally {
      setLoading(false);
    }
  };

  const [loadingServerCheck, setLoadingServerCheck] = useState<boolean>(false);

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
    url = url.trim();

    const result = await checkUrl(url);

    if (result === undefined) {
      Alert.alert(
        "Connection failed",
        "Could not connect to the server. Please check the URL and your network connection."
      );
      return;
    }

    setServer({ address: url });
  }, []);

  const handleQuickConnect = async () => {
    try {
      const code = await initiateQuickConnect();
      if (code) {
        Alert.alert("Quick Connect", `Enter code ${code} to login`, [
          {
            text: "Got It",
          },
        ]);
      }
    } catch (error) {
      Alert.alert("Error", "Failed to initiate Quick Connect");
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
                    Log in
                    <>
                      {serverName ? (
                        <>
                          {" to "}
                          <Text className="text-purple-600">{serverName}</Text>
                        </>
                      ) : null}
                    </>
                  </Text>
                  <Text className="text-xs text-neutral-400">
                    {api.basePath}
                  </Text>
                  <Input
                    placeholder="Username"
                    onChangeText={(text) =>
                      setCredentials({ ...credentials, username: text })
                    }
                    value={credentials.username}
                    // use auto focus with small delay so keyboard only shows up when not logged in
                    autoFocusDelay={500}
                    secureTextEntry={false}
                    keyboardType="default"
                    returnKeyType="done"
                    autoCapitalize="none"
                    textContentType="username"
                    clearButtonMode="while-editing"
                    maxLength={500}
                  />

                  <Input
                    placeholder="Password"
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
                  />
                  <View className="flex flex-row items-center justify-between">
                    <Button
                      onPress={handleLogin}
                      loading={loading}
                      className="flex-1 mr-2"
                    >
                      Log in
                    </Button>
                    <TouchableOpacity
                      onPress={handleQuickConnect}
                      className="p-2 bg-neutral-900 rounded-xl h-12 w-12 flex items-center justify-center"
                    >
                      <MaterialCommunityIcons
                        name="cellphone-lock"
                        size={24}
                        color="white"
                      />
                    </TouchableOpacity>
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
                  Enter the URL to your Jellyfin server
                </Text>
                <Input
                  aria-label="Server URL"
                  placeholder="http(s)://your-server.com"
                  onChangeText={setServerURL}
                  value={serverURL}
                  keyboardType="url"
                  returnKeyType="done"
                  autoCapitalize="none"
                  textContentType="URL"
                  maxLength={500}
                />

                <Button
                  loading={loadingServerCheck}
                  disabled={loadingServerCheck}
                  onPress={async () => await handleConnect(serverURL)}
                  className="w-full grow"
                >
                  Connect
                </Button>
                <JellyfinServerDiscovery
                  onServerSelect={(server) => {
                    setServerURL(server.address);
                    if (server.serverName) {
                      setServerName(server.serverName);
                    }
                    handleConnect(server.address);
                  }}
                />
                <PreviousServersList
                  onServerSelect={(s) => {
                    handleConnect(s.address);
                  }}
                />
              </View>
            </View>
          </>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default Login;
