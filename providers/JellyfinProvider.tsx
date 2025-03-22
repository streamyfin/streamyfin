import "@/augmentations";
import { useInterval } from "@/hooks/useInterval";
import { JellyseerrApi, useJellyseerr } from "@/hooks/useJellyseerr";
import { useSettings } from "@/utils/atoms/settings";
import { writeErrorLog, writeInfoLog } from "@/utils/log";
import { storage } from "@/utils/mmkv";
import { store } from "@/utils/store";
import { type Api, Jellyfin } from "@jellyfin/sdk";
import type { UserDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getUserApi } from "@jellyfin/sdk/lib/utils/api";
import { useMutation, useQuery } from "@tanstack/react-query";
import axios, { AxiosError } from "axios";
import { router, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { atom, useAtom } from "jotai";
import type React from "react";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { Platform } from "react-native";
import { getDeviceName } from "react-native-device-info";
import uuid from "react-native-uuid";

interface Server {
  address: string;
}

export const apiAtom = atom<Api | null>(null);
export const userAtom = atom<UserDto | null>(null);
export const wsAtom = atom<WebSocket | null>(null);

interface JellyfinContextValue {
  discoverServers: (url: string) => Promise<Server[]>;
  setServer: (server: Server) => Promise<void>;
  removeServer: () => void;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  initiateQuickConnect: () => Promise<string | undefined>;
}

const JellyfinContext = createContext<JellyfinContextValue | undefined>(
  undefined,
);

export const JellyfinProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [jellyfin, setJellyfin] = useState<Jellyfin | undefined>(undefined);
  const [deviceId, setDeviceId] = useState<string | undefined>(undefined);

  const { t } = useTranslation();

  useEffect(() => {
    (async () => {
      const id = getOrSetDeviceId();
      const deviceName = await getDeviceName();
      setJellyfin(
        () =>
          new Jellyfin({
            clientInfo: { name: "Streamyfin", version: "0.28.0" },
            deviceInfo: {
              name: deviceName,
              id,
            },
          }),
      );
      setDeviceId(id);
    })();
  }, []);

  const [api, setApi] = useAtom(apiAtom);
  const [user, setUser] = useAtom(userAtom);
  const [isPolling, setIsPolling] = useState<boolean>(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [
    settings,
    updateSettings,
    pluginSettings,
    setPluginSettings,
    refreshStreamyfinPluginSettings,
  ] = useSettings();
  const { clearAllJellyseerData, setJellyseerrUser } = useJellyseerr();

  const headers = useMemo(() => {
    if (!deviceId) return {};
    return {
      authorization: `MediaBrowser Client="Streamyfin", Device=${
        Platform.OS === "android" ? "Android" : "iOS"
      }, DeviceId="${deviceId}", Version="0.28.0"`,
    };
  }, [deviceId]);

  const initiateQuickConnect = useCallback(async () => {
    if (!api || !deviceId) return;
    try {
      const response = await api.axiosInstance.post(
        api.basePath + "/QuickConnect/Initiate",
        null,
        {
          headers,
        },
      );
      if (response?.status === 200) {
        setSecret(response?.data?.Secret);
        setIsPolling(true);
        return response.data?.Code;
      } else {
        throw new Error("Failed to initiate quick connect");
      }
    } catch (error) {
      console.error(error);
      throw error;
    }
  }, [api, deviceId, headers]);

  const pollQuickConnect = useCallback(async () => {
    if (!api || !secret) return;

    try {
      const response = await api.axiosInstance.get(
        `${api.basePath}/QuickConnect/Connect?Secret=${secret}`,
      );

      if (response.status === 200) {
        if (response.data.Authenticated) {
          setIsPolling(false);

          const authResponse = await api.axiosInstance.post(
            api.basePath + "/Users/AuthenticateWithQuickConnect",
            {
              secret,
            },
            {
              headers,
            },
          );

          const { AccessToken, User } = authResponse.data;
          api.accessToken = AccessToken;
          setUser(User);
          storage.set("token", AccessToken);
          storage.set("user", JSON.stringify(User));
          return true;
        }
      }
      return false;
    } catch (error) {
      if (error instanceof AxiosError && error.response?.status === 400) {
        setIsPolling(false);
        setSecret(null);
        throw new Error("The code has expired. Please try again.");
      } else {
        console.error("Error polling Quick Connect:", error);
        throw error;
      }
    }
  }, [api, secret, headers]);

  useEffect(() => {
    (async () => {
      await refreshStreamyfinPluginSettings();
    })();
  }, []);

  useEffect(() => {
    store.set(apiAtom, api);
  }, [api]);

  useInterval(pollQuickConnect, isPolling ? 1000 : null);
  useInterval(refreshStreamyfinPluginSettings, 60 * 5 * 1000); // 5 min

  const discoverServers = async (url: string): Promise<Server[]> => {
    const servers =
      await jellyfin?.discovery.getRecommendedServerCandidates(url);
    return servers?.map((server) => ({ address: server.address })) || [];
  };

  const setServerMutation = useMutation({
    mutationFn: async (server: Server) => {
      const apiInstance = jellyfin?.createApi(server.address);

      if (!apiInstance?.basePath) throw new Error("Failed to connect");

      setApi(apiInstance);
      storage.set("serverUrl", server.address);
    },
    onSuccess: (_, server) => {
      const previousServers = JSON.parse(
        storage.getString("previousServers") || "[]",
      );
      const updatedServers = [
        server,
        ...previousServers.filter((s: Server) => s.address !== server.address),
      ];
      storage.set(
        "previousServers",
        JSON.stringify(updatedServers.slice(0, 5)),
      );
    },
    onError: (error) => {
      console.error("Failed to set server:", error);
    },
  });

  const removeServerMutation = useMutation({
    mutationFn: async () => {
      storage.delete("serverUrl");
      setApi(null);
    },
    onError: (error) => {
      console.error("Failed to remove server:", error);
    },
  });

  const loginMutation = useMutation({
    mutationFn: async ({
      username,
      password,
    }: {
      username: string;
      password: string;
    }) => {
      if (!api || !jellyfin) throw new Error("API not initialized");

      try {
        const auth = await api.authenticateUserByName(username, password);

        if (auth.data.AccessToken && auth.data.User) {
          setUser(auth.data.User);
          storage.set("user", JSON.stringify(auth.data.User));
          setApi(jellyfin.createApi(api?.basePath, auth.data?.AccessToken));
          storage.set("token", auth.data?.AccessToken);

          const recentPluginSettings = await refreshStreamyfinPluginSettings();
          if (recentPluginSettings?.jellyseerrServerUrl?.value) {
            const jellyseerrApi = new JellyseerrApi(
              recentPluginSettings.jellyseerrServerUrl.value,
            );
            await jellyseerrApi.test().then((result) => {
              if (result.isValid && result.requiresPass) {
                jellyseerrApi.login(username, password).then(setJellyseerrUser);
              }
            });
          }
        }
      } catch (error) {
        if (axios.isAxiosError(error)) {
          switch (error.response?.status) {
            case 401:
              throw new Error(t("login.invalid_username_or_password"));
            case 403:
              throw new Error(
                t("login.user_does_not_have_permission_to_log_in"),
              );
            case 408:
              throw new Error(
                t("login.server_is_taking_too_long_to_respond_try_again_later"),
              );
            case 429:
              throw new Error(
                t("login.server_received_too_many_requests_try_again_later"),
              );
            case 500:
              throw new Error(t("login.there_is_a_server_error"));
            default:
              throw new Error(
                t(
                  "login.an_unexpected_error_occured_did_you_enter_the_correct_url",
                ),
              );
          }
        }
        throw error;
      }
    },
    onError: (error) => {
      console.error("Login failed:", error);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      api
        ?.delete(`/Streamyfin/device/${deviceId}`)
        .then((r) => writeInfoLog("Deleted expo push token for device"))
        .catch((e) =>
          writeErrorLog(`Failed to delete expo push token for device`),
        );

      storage.delete("token");
      setUser(null);
      setApi(null);
      setPluginSettings(undefined);
      await clearAllJellyseerData();
    },
    onError: (error) => {
      console.error("Logout failed:", error);
    },
  });

  const [loaded, setLoaded] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);

  useEffect(() => {
    if (initialLoaded) {
      setLoaded(true);
    }
  }, [initialLoaded]);

  useEffect(() => {
    const initializeJellyfin = async () => {
      if (!jellyfin) return;

      try {
        const token = getTokenFromStorage();
        const serverUrl = getServerUrlFromStorage();
        const storedUser = getUserFromStorage();

        if (serverUrl && token) {
          const apiInstance = jellyfin.createApi(serverUrl, token);
          setApi(apiInstance);

          if (storedUser?.Id) {
            setUser(storedUser);
          }

          const response = await getUserApi(apiInstance).getCurrentUser();
          setUser(response.data);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setInitialLoaded(true);
      }
    };

    initializeJellyfin();
  }, [jellyfin]);

  const contextValue: JellyfinContextValue = {
    discoverServers,
    setServer: (server) => setServerMutation.mutateAsync(server),
    removeServer: () => removeServerMutation.mutateAsync(),
    login: (username, password) =>
      loginMutation.mutateAsync({ username, password }),
    logout: () => logoutMutation.mutateAsync(),
    initiateQuickConnect,
  };

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  useProtectedRoute(user, loaded);

  return (
    <JellyfinContext.Provider value={contextValue}>
      {children}
    </JellyfinContext.Provider>
  );
};

export const useJellyfin = (): JellyfinContextValue => {
  const context = useContext(JellyfinContext);
  if (!context)
    throw new Error("useJellyfin must be used within a JellyfinProvider");
  return context;
};

function useProtectedRoute(user: UserDto | null, loaded = false) {
  const segments = useSegments();

  useEffect(() => {
    if (loaded === false) return;

    console.log("Loaded", user);

    const inAuthGroup = segments[0] === "(auth)";

    if (!user?.Id && inAuthGroup) {
      console.log("Redirected to login");
      router.replace("/login");
    } else if (user?.Id && !inAuthGroup) {
      console.log("Redirected to home");
      router.replace("/(auth)/(tabs)/(home)/");
    }
  }, [user, segments, loaded]);
}

export function getTokenFromStorage(): string | null {
  return storage.getString("token") || null;
}

export function getUserFromStorage(): UserDto | null {
  const userStr = storage.getString("user");
  if (userStr) {
    try {
      return JSON.parse(userStr) as UserDto;
    } catch (e) {
      console.error(e);
    }
  }
  return null;
}

export function getServerUrlFromStorage(): string | null {
  return storage.getString("serverUrl") || null;
}

export function getOrSetDeviceId(): string {
  let deviceId = storage.getString("deviceId");

  if (!deviceId) {
    deviceId = uuid.v4() as string;
    storage.set("deviceId", deviceId);
  }

  return deviceId;
}
