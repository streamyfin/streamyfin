import "@/augmentations";
import { type Api, Jellyfin } from "@jellyfin/sdk";
import type { UserDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getUserApi } from "@jellyfin/sdk/lib/utils/api";
import { useMutation } from "@tanstack/react-query";
import axios, { AxiosError } from "axios";
import { router, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { atom, useAtom } from "jotai";
import type React from "react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { AppState, Platform } from "react-native";
import { getDeviceName } from "react-native-device-info";
import uuid from "react-native-uuid";
import { useInterval } from "@/hooks/useInterval";
import { JellyseerrApi, useJellyseerr } from "@/hooks/useJellyseerr";
import { useSettings } from "@/utils/atoms/settings";
import { writeErrorLog, writeInfoLog } from "@/utils/log";
import { storage } from "@/utils/mmkv";
import {
  type AccountSecurityType,
  addServerToList,
  deleteAccountCredential,
  getAccountCredential,
  hashPIN,
  migrateToMultiAccount,
  saveAccountCredential,
  updateAccountToken,
} from "@/utils/secureCredentials";
import { store } from "@/utils/store";

interface Server {
  address: string;
}

export const apiAtom = atom<Api | null>(null);
export const userAtom = atom<UserDto | null>(null);
export const wsAtom = atom<WebSocket | null>(null);

interface LoginOptions {
  saveAccount?: boolean;
  securityType?: AccountSecurityType;
  pinCode?: string;
}

interface JellyfinContextValue {
  discoverServers: (url: string) => Promise<Server[]>;
  setServer: (server: Server) => Promise<void>;
  removeServer: () => void;
  login: (
    username: string,
    password: string,
    serverName?: string,
    options?: LoginOptions,
  ) => Promise<void>;
  logout: () => Promise<void>;
  initiateQuickConnect: () => Promise<string | undefined>;
  loginWithSavedCredential: (
    serverUrl: string,
    userId: string,
  ) => Promise<void>;
  loginWithPassword: (
    serverUrl: string,
    username: string,
    password: string,
  ) => Promise<void>;
  removeSavedCredential: (serverUrl: string, userId: string) => Promise<void>;
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
            clientInfo: { name: "Streamyfin", version: "0.52.0" },
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
  const { setPluginSettings, refreshStreamyfinPluginSettings } = useSettings();
  const { clearAllJellyseerData, setJellyseerrUser } = useJellyseerr();

  const headers = useMemo(() => {
    if (!deviceId) return {};
    return {
      authorization: `MediaBrowser Client="Streamyfin", Device=${
        Platform.OS === "android" ? "Android" : "iOS"
      }, DeviceId="${deviceId}", Version="0.52.0"`,
    };
  }, [deviceId]);

  const initiateQuickConnect = useCallback(async () => {
    if (!api || !deviceId) return;
    try {
      const response = await api.axiosInstance.post(
        `${api.basePath}/QuickConnect/Initiate`,
        null,
        {
          headers,
        },
      );
      if (response?.status === 200) {
        setSecret(response?.data?.Secret);
        setIsPolling(true);
        return response.data?.Code;
      }
      throw new Error("Failed to initiate quick connect");
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
            `${api.basePath}/Users/AuthenticateWithQuickConnect`,
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
      }
      console.error("Error polling Quick Connect:", error);
      throw error;
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

  // Refresh plugin settings when app comes to foreground
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (nextAppState === "active") {
        refreshStreamyfinPluginSettings();
      }
    });

    return () => subscription.remove();
  }, []);

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
    onSuccess: async (_, server) => {
      // Add server to the list (will update existing or add new)
      addServerToList(server.address);
    },
    onError: (error) => {
      console.error("Failed to set server:", error);
    },
  });

  const removeServerMutation = useMutation({
    mutationFn: async () => {
      storage.remove("serverUrl");
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
      serverName,
      options,
    }: {
      username: string;
      password: string;
      serverName?: string;
      options?: LoginOptions;
    }) => {
      if (!api || !jellyfin) throw new Error("API not initialized");

      try {
        const auth = await api.authenticateUserByName(username, password);

        if (auth.data.AccessToken && auth.data.User) {
          setUser(auth.data.User);
          storage.set("user", JSON.stringify(auth.data.User));
          setApi(jellyfin.createApi(api?.basePath, auth.data?.AccessToken));
          storage.set("token", auth.data?.AccessToken);

          // Save credentials to secure storage if requested
          if (api.basePath && options?.saveAccount) {
            const securityType = options.securityType || "none";
            let pinHash: string | undefined;

            if (securityType === "pin" && options.pinCode) {
              pinHash = await hashPIN(options.pinCode);
            }

            await saveAccountCredential({
              serverUrl: api.basePath,
              serverName: serverName || "",
              token: auth.data.AccessToken,
              userId: auth.data.User.Id || "",
              username,
              savedAt: Date.now(),
              securityType,
              pinHash,
            });
          }

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
      await api
        ?.delete(`/Streamyfin/device/${deviceId}`)
        .then((_r) => writeInfoLog("Deleted expo push token for device"))
        .catch((_e) =>
          writeErrorLog("Failed to delete expo push token for device"),
        );

      storage.remove("token");
      setUser(null);
      setApi(null);
      setPluginSettings(undefined);
      await clearAllJellyseerData();
      // Note: We keep saved credentials for quick switching back
    },
    onError: (error) => {
      console.error("Logout failed:", error);
    },
  });

  const loginWithSavedCredentialMutation = useMutation({
    mutationFn: async ({
      serverUrl,
      userId,
    }: {
      serverUrl: string;
      userId: string;
    }) => {
      if (!jellyfin) throw new Error("Jellyfin not initialized");

      const credential = await getAccountCredential(serverUrl, userId);
      if (!credential) {
        throw new Error("No saved credential found");
      }

      // Create API instance with saved token
      const apiInstance = jellyfin.createApi(serverUrl, credential.token);
      if (!apiInstance) {
        throw new Error("Failed to create API instance");
      }

      // Validate token by fetching current user
      try {
        const response = await getUserApi(apiInstance).getCurrentUser();

        // Token is valid, update state
        setApi(apiInstance);
        setUser(response.data);
        storage.set("serverUrl", serverUrl);
        storage.set("token", credential.token);
        storage.set("user", JSON.stringify(response.data));

        // Refresh plugin settings
        await refreshStreamyfinPluginSettings();
      } catch (error) {
        // Token is invalid/expired - remove it
        if (
          axios.isAxiosError(error) &&
          (error.response?.status === 401 || error.response?.status === 403)
        ) {
          await deleteAccountCredential(serverUrl, userId);
          throw new Error(t("server.session_expired"));
        }
        throw error;
      }
    },
    onError: (error) => {
      console.error("Quick login failed:", error);
    },
  });

  const loginWithPasswordMutation = useMutation({
    mutationFn: async ({
      serverUrl,
      username,
      password,
    }: {
      serverUrl: string;
      username: string;
      password: string;
    }) => {
      if (!jellyfin) throw new Error("Jellyfin not initialized");

      // Create API instance for the server
      const apiInstance = jellyfin.createApi(serverUrl);
      if (!apiInstance) {
        throw new Error("Failed to create API instance");
      }

      // Authenticate with password
      const auth = await apiInstance.authenticateUserByName(username, password);

      if (auth.data.AccessToken && auth.data.User) {
        setUser(auth.data.User);
        storage.set("user", JSON.stringify(auth.data.User));
        setApi(jellyfin.createApi(serverUrl, auth.data.AccessToken));
        storage.set("serverUrl", serverUrl);
        storage.set("token", auth.data.AccessToken);

        // Update the saved credential with new token
        await updateAccountToken(
          serverUrl,
          auth.data.User.Id || "",
          auth.data.AccessToken,
        );

        // Refresh plugin settings
        await refreshStreamyfinPluginSettings();
      }
    },
    onError: (error) => {
      console.error("Password login failed:", error);
      throw error;
    },
  });

  const removeSavedCredentialMutation = useMutation({
    mutationFn: async ({
      serverUrl,
      userId,
    }: {
      serverUrl: string;
      userId: string;
    }) => {
      await deleteAccountCredential(serverUrl, userId);
    },
    onError: (error) => {
      console.error("Failed to remove saved credential:", error);
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
        // Run migration to multi-account format (once)
        await migrateToMultiAccount();

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

          // Migrate current session to secure storage if not already saved
          if (storedUser?.Id && storedUser?.Name) {
            const existingCredential = await getAccountCredential(
              serverUrl,
              storedUser.Id,
            );
            if (!existingCredential) {
              await saveAccountCredential({
                serverUrl,
                serverName: "",
                token,
                userId: storedUser.Id,
                username: storedUser.Name,
                savedAt: Date.now(),
                securityType: "none",
              });
            }
          }
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
    login: (username, password, serverName, options) =>
      loginMutation.mutateAsync({ username, password, serverName, options }),
    logout: () => logoutMutation.mutateAsync(),
    initiateQuickConnect,
    loginWithSavedCredential: (serverUrl, userId) =>
      loginWithSavedCredentialMutation.mutateAsync({ serverUrl, userId }),
    loginWithPassword: (serverUrl, username, password) =>
      loginWithPasswordMutation.mutateAsync({ serverUrl, username, password }),
    removeSavedCredential: (serverUrl, userId) =>
      removeSavedCredentialMutation.mutateAsync({ serverUrl, userId }),
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

    const inAuthGroup = segments.length > 1 && segments[0] === "(auth)";

    if (!user?.Id && inAuthGroup) {
      router.replace("/login");
    } else if (user?.Id && !inAuthGroup) {
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
