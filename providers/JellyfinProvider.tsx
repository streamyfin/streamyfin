import { useInterval } from "@/hooks/useInterval";
import { Api, Jellyfin } from "@jellyfin/sdk";
import { UserDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getUserApi } from "@jellyfin/sdk/lib/utils/api";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useMutation, useQuery } from "@tanstack/react-query";
import axios, { AxiosError } from "axios";
import { router, useSegments } from "expo-router";
import { atom, useAtom } from "jotai";
import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Platform } from "react-native";
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
  undefined
);

export const JellyfinProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [jellyfin, setJellyfin] = useState<Jellyfin | undefined>(undefined);
  const [deviceId, setDeviceId] = useState<string | undefined>(undefined);

  useEffect(() => {
    (async () => {
      const id = await getOrSetDeviceId();
      setJellyfin(
        () =>
          new Jellyfin({
            clientInfo: { name: "Streamyfin", version: "0.20.1" },
            deviceInfo: { name: Platform.OS === "ios" ? "iOS" : "Android", id },
          })
      );
      setDeviceId(id);
    })();
  }, []);

  const [api, setApi] = useAtom(apiAtom);
  const [user, setUser] = useAtom(userAtom);
  const [isPolling, setIsPolling] = useState<boolean>(false);
  const [secret, setSecret] = useState<string | null>(null);

  useQuery({
    queryKey: ["user", api],
    queryFn: async () => {
      if (!api) return null;
      const response = await getUserApi(api).getCurrentUser();
      if (response.data) setUser(response.data);
      return user;
    },
    enabled: !!api,
    refetchOnWindowFocus: true,
    refetchInterval: 1000 * 60,
    refetchIntervalInBackground: true,
    refetchOnMount: true,
    refetchOnReconnect: true,
  });

  const headers = useMemo(() => {
    if (!deviceId) return {};
    return {
      authorization: `MediaBrowser Client="Streamyfin", Device=${
        Platform.OS === "android" ? "Android" : "iOS"
      }, DeviceId="${deviceId}", Version="0.20.1"`,
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
        }
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
        `${api.basePath}/QuickConnect/Connect?Secret=${secret}`
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
            }
          );

          const { AccessToken, User } = authResponse.data;
          api.accessToken = AccessToken;
          setUser(User);
          await AsyncStorage.setItem("token", AccessToken);
          await AsyncStorage.setItem("user", JSON.stringify(User));
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

  useInterval(pollQuickConnect, isPolling ? 1000 : null);

  const discoverServers = async (url: string): Promise<Server[]> => {
    const servers = await jellyfin?.discovery.getRecommendedServerCandidates(
      url
    );
    return servers?.map((server) => ({ address: server.address })) || [];
  };

  const setServerMutation = useMutation({
    mutationFn: async (server: Server) => {
      const apiInstance = jellyfin?.createApi(server.address);

      if (!apiInstance?.basePath) throw new Error("Failed to connect");

      setApi(apiInstance);
      await AsyncStorage.setItem("serverUrl", server.address);
    },
    onError: (error) => {
      console.error("Failed to set server:", error);
    },
  });

  const removeServerMutation = useMutation({
    mutationFn: async () => {
      await AsyncStorage.removeItem("serverUrl");
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
          await AsyncStorage.setItem("user", JSON.stringify(auth.data.User));
          setApi(jellyfin.createApi(api?.basePath, auth.data?.AccessToken));
          await AsyncStorage.setItem("token", auth.data?.AccessToken);
        }
      } catch (error) {
        if (axios.isAxiosError(error)) {
          switch (error.response?.status) {
            case 401:
              throw new Error("Invalid username or password");
            case 403:
              throw new Error("User does not have permission to log in");
            case 408:
              throw new Error(
                "Server is taking too long to respond, try again later"
              );
            case 429:
              throw new Error(
                "Server received too many requests, try again later"
              );
            case 500:
              throw new Error("There is a server error");
            default:
              throw new Error(
                "An unexpected error occurred. Did you enter the server URL correctly?"
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
      await AsyncStorage.removeItem("token");
      setUser(null);
    },
    onError: (error) => {
      console.error("Logout failed:", error);
    },
  });

  const { isLoading, isFetching } = useQuery({
    queryKey: [
      "initializeJellyfin",
      user?.Id,
      api?.basePath,
      jellyfin?.clientInfo,
    ],
    queryFn: async () => {
      try {
        const token = await getTokenFromStoraage();
        const serverUrl = await getServerUrlFromStorage();
        const user = JSON.parse(
          (await getUserFromStorage()) as string
        ) as UserDto;

        if (serverUrl && token && user.Id && jellyfin) {
          const apiInstance = jellyfin.createApi(serverUrl, token);
          setApi(apiInstance);
          setUser(user);
        }

        return true;
      } catch (e) {
        console.error(e);
      }
    },
    staleTime: 0,
    enabled: !user?.Id || !api || !jellyfin,
  });

  const contextValue: JellyfinContextValue = {
    discoverServers,
    setServer: (server) => setServerMutation.mutateAsync(server),
    removeServer: () => removeServerMutation.mutateAsync(),
    login: (username, password) =>
      loginMutation.mutateAsync({ username, password }),
    logout: () => logoutMutation.mutateAsync(),
    initiateQuickConnect,
  };

  useProtectedRoute(user, isLoading || isFetching);

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

function useProtectedRoute(user: UserDto | null, loading = false) {
  const segments = useSegments();

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === "(auth)";

    if (!user?.Id && inAuthGroup) {
      router.replace("/login");
    } else if (user?.Id && !inAuthGroup) {
      router.replace("/(auth)/(tabs)/(home)/");
    }
  }, [user, segments, loading]);
}

export async function getTokenFromStoraage() {
  return await AsyncStorage.getItem("token");
}

export async function getUserFromStorage() {
  return await AsyncStorage.getItem("user");
}

export async function getServerUrlFromStorage() {
  return await AsyncStorage.getItem("serverUrl");
}

export async function getOrSetDeviceId() {
  let deviceId = await AsyncStorage.getItem("deviceId");

  if (!deviceId) {
    deviceId = uuid.v4() as string;
    await AsyncStorage.setItem("deviceId", deviceId);
  }

  return deviceId;
}
