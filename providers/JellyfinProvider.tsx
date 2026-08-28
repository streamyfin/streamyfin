import "@/augmentations";
import { type Api, Jellyfin } from "@jellyfin/sdk";
import type { UserDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getUserApi } from "@jellyfin/sdk/lib/utils/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import axios, { AxiosError } from "axios";
import { useSegments } from "expo-router";
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
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { Platform } from "react-native";
import { getDeviceNameSync } from "react-native-device-info";
import { toast } from "sonner-native";
import useRouter from "@/hooks/useAppRouter";
import { useInterval } from "@/hooks/useInterval";
import { JellyseerrApi, useJellyseerr } from "@/hooks/useJellyseerr";
import { settingsAtom, useSettings } from "@/utils/atoms/settings";
import { getIntegrationHeaders } from "@/utils/customHeaders";
import { getOrSetDeviceId } from "@/utils/device";
import { markExpectedError } from "@/utils/errors";
import { createApiWithCustomHeaders } from "@/utils/jellyfin/createApi";
import {
  logAndCaptureError,
  writeErrorLog,
  writeInfoLog,
  writeToLog,
} from "@/utils/log";
import { storage } from "@/utils/mmkv";
import { onAppForeground } from "@/utils/onAppForeground";
import {
  type AccountSecurityType,
  addAccountToServer,
  addServerToList,
  deleteAccountCredential,
  deleteJellyseerrPassword,
  getAccountCredential,
  hashPIN,
  migrateToMultiAccount,
  saveAccountCredential,
  saveJellyseerrPassword,
  updateAccountToken,
} from "@/utils/secureCredentials";
import { store } from "@/utils/store";
import { clearTVDiscoverySafely } from "@/utils/tvDiscovery/sync";
import { APP_VERSION } from "@/utils/version";

interface Server {
  address: string;
}

// Compact wire-level description of a failed request for the in-app log —
// the user-facing alert only shows a translated message, which hides whether
// the failure was DNS, TLS, a timeout or an HTTP status.
const describeRequestError = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    return [
      error.code,
      error.response ? `HTTP ${error.response.status}` : "no response",
      error.message,
    ]
      .filter(Boolean)
      .join(", ");
  }
  return error instanceof Error
    ? `${error.name}: ${error.message}`
    : String(error);
};

const initialApi = (() => {
  try {
    const token = storage.getString("token") || null;
    const serverUrl = storage.getString("serverUrl") || null;
    if (serverUrl && token) {
      const id = getOrSetDeviceId();
      const deviceName = getDeviceNameSync();
      const jellyfinInstance = new Jellyfin({
        clientInfo: { name: "Streamyfin", version: APP_VERSION },
        deviceInfo: {
          name: deviceName,
          id,
        },
      });
      return createApiWithCustomHeaders(jellyfinInstance, serverUrl, token);
    }
  } catch (e) {
    console.error("Failed to initialize API synchronously:", e);
  }
  return null;
})();

const initialUser = (() => {
  try {
    // Only return a stored user if we also have a token. Otherwise the
    // user atom would be populated while the api atom is null (e.g. after
    // a logout that left stale user JSON in storage), which causes
    // useProtectedRoute to keep us inside the (auth) group instead of
    // redirecting to /login.
    const token = storage.getString("token");
    if (!token) return null;
    const userStr = storage.getString("user");
    if (userStr) {
      return JSON.parse(userStr) as UserDto;
    }
  } catch (e) {
    console.error("Failed to parse initial user synchronously:", e);
  }
  return null;
})();

export const apiAtom = atom<Api | null>(initialApi);
export const userAtom = atom<UserDto | null>(initialUser);
export const wsAtom = atom<WebSocket | null>(null);
export const cacheVersionAtom = atom<number>(0);
// Set by a login flow that wants the account saved: the protection picker
// shows AFTER the session is authorized (the login screen unmounts on
// success, so the modal lives at the root — see PendingAccountSaveModal).
export const pendingAccountSaveAtom = atom<{ serverName?: string } | null>(
  null,
);

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
  saveCurrentAccount: (options?: {
    securityType?: AccountSecurityType;
    pinCode?: string;
    serverName?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  initiateQuickConnect: () => Promise<string | undefined>;
  stopQuickConnectPolling: () => void;
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
  switchServerUrl: (newUrl: string) => void;
}

const JellyfinContext = createContext<JellyfinContextValue | undefined>(
  undefined,
);

export const JellyfinProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [jellyfin] = useState<Jellyfin | undefined>(() => {
    try {
      const id = getOrSetDeviceId();
      const deviceName = getDeviceNameSync();
      return new Jellyfin({
        clientInfo: { name: "Streamyfin", version: APP_VERSION },
        deviceInfo: {
          name: deviceName,
          id,
        },
      });
    } catch (e) {
      console.error("Failed to initialize Jellyfin synchronously in state:", e);
      return undefined;
    }
  });
  const [deviceId] = useState<string | undefined>(() => {
    try {
      return getOrSetDeviceId();
    } catch {
      return undefined;
    }
  });

  const { t } = useTranslation();

  const [api, setApi] = useAtom(apiAtom);
  const [user, setUser] = useAtom(userAtom);
  const [isPolling, setIsPolling] = useState<boolean>(false);
  const [secret, setSecret] = useState<string | null>(null);
  const { settings, setPluginSettings, refreshStreamyfinPluginSettings } =
    useSettings();
  const { clearAllJellyseerData, jellyseerrUser, setJellyseerrUser } =
    useJellyseerr();
  const queryClient = useQueryClient();

  // Passwordless Seerr sign-in. With an admin API key (typically distributed
  // through the Streamyfin plugin) the Seerr account linked to the current
  // Jellyfin user is resolved directly via /user/jellyfin/{id} — this also
  // covers Quick Connect logins and restored sessions, where no password is
  // ever available. One attempt per server+user per app run, so a failing key
  // cannot turn into a retry loop.
  const jellyseerrAutoConnectAttempt = useRef<string | null>(null);
  useEffect(() => {
    if (!user?.Id) {
      // Logout invalidates the guard so the next login may connect again.
      jellyseerrAutoConnectAttempt.current = null;
      return;
    }
    const serverUrl = settings?.jellyseerrServerUrl;
    const apiKey = settings?.jellyseerrApiKey;
    if (!serverUrl || !apiKey || jellyseerrUser) return;
    const attemptKey = `${serverUrl}:${user.Id}`;
    if (jellyseerrAutoConnectAttempt.current === attemptKey) return;
    jellyseerrAutoConnectAttempt.current = attemptKey;
    new JellyseerrApi(serverUrl, getIntegrationHeaders("jellyseerr"), apiKey)
      .loginWithApiKey(user.Id)
      .then(setJellyseerrUser)
      .catch((e) =>
        writeErrorLog(
          `Seerr API-key sign-in failed: ${e instanceof Error ? e.message : e}`,
        ),
      );
  }, [
    user?.Id,
    settings?.jellyseerrServerUrl,
    settings?.jellyseerrApiKey,
    jellyseerrUser,
    setJellyseerrUser,
  ]);

  // --- Session-expiry handling ----------------------------------------------
  // When the server revokes the token (e.g. the device/session is deleted), a
  // 401 can surface from any authenticated request. Without central handling
  // the dead token stays in storage, so every reload re-fires authed calls →
  // 401 spam + uncaught rejections, and the app lingers in a half-authenticated
  // state. A single response interceptor on the authenticated api clears the
  // session on the first 401 so the app drops cleanly to the login screen.
  const sessionExpiredRef = useRef(false);

  // Shared teardown for manual logout AND forced session expiry — keeping it
  // in one place prevents the two paths from drifting (a 401 expiry must wipe
  // plugin settings / Jellyseerr state too, or the next login on the same
  // device inherits the previous user's data).
  // Saved credentials are kept so the user can quick-login again.
  const clearSessionState = useCallback(async () => {
    // Read before the wipe below: the Jellyseerr password is filed under the
    // Jellyfin server URL + user id, and both are about to be cleared.
    const jellyfinUrl = storage.getString("serverUrl");
    const jellyfinUserId = store.get(userAtom)?.Id;

    // All synchronous teardown first: if the async Jellyseerr cleanup below
    // fails or resolves late (user may already be re-authenticating), the
    // session/cache state is already gone.
    storage.remove("token");
    storage.remove("user");
    storage.remove("REACT_QUERY_OFFLINE_CACHE");
    clearTVDiscoverySafely();
    setUser(null);
    setApi(null);
    setPluginSettings(undefined);
    queryClient.clear();

    if (jellyfinUrl && jellyfinUserId) {
      await deleteJellyseerrPassword(jellyfinUrl, jellyfinUserId).catch((e) =>
        writeErrorLog(`Failed to clear Jellyseerr password: ${e}`),
      );
    }

    try {
      await clearAllJellyseerData();
    } catch (e) {
      writeErrorLog(
        `Failed to clear Jellyseerr data: ${e instanceof Error ? e.message : e}`,
      );
    }
  }, [setUser, setApi, setPluginSettings, clearAllJellyseerData, queryClient]);

  const handleSessionExpired = useCallback(() => {
    if (sessionExpiredRef.current) return; // run once per session
    sessionExpiredRef.current = true;
    clearSessionState().catch((e) =>
      writeErrorLog(`Session-expiry cleanup failed: ${e?.message ?? e}`),
    );
  }, [clearSessionState]);

  useEffect(() => {
    // Only guard an authenticated session. A pre-auth api (login screen) keeps
    // its own handling — a wrong-password 401 is not a session expiry.
    if (!api?.accessToken) return;
    sessionExpiredRef.current = false; // re-arm for this fresh session
    const interceptorId = api.axiosInstance.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error?.response?.status === 401) {
          handleSessionExpired();
        }
        return Promise.reject(error);
      },
    );
    return () => {
      api.axiosInstance.interceptors.response.eject(interceptorId);
    };
  }, [api, handleSessionExpired]);

  const headers = useMemo(() => {
    if (!deviceId) return {};
    return {
      authorization: `MediaBrowser Client="Streamyfin", Device=${
        Platform.OS === "android" ? "Android" : "iOS"
      }, DeviceId="${deviceId}", Version="${APP_VERSION}"`,
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

  const stopQuickConnectPolling = useCallback(() => {
    setIsPolling(false);
    setSecret(null);
  }, []);

  const pollQuickConnect = useCallback(async () => {
    if (!api || !secret || !jellyfin) return;

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
          setUser(User);
          setApi(
            createApiWithCustomHeaders(jellyfin, api.basePath, AccessToken),
          );
          storage.set("token", AccessToken);
          storage.set("user", JSON.stringify(User));
          return true;
        }
      }
      return false;
    } catch (error) {
      if (error instanceof AxiosError) {
        if (error.response?.status === 400 || error.response?.status === 404) {
          setIsPolling(false);
          setSecret(null);
          if (error.response?.status === 400) {
            throw new Error("The code has expired. Please try again.");
          }
          return false;
        }
      }
      console.error("Error polling Quick Connect:", error);
      throw error;
    }
  }, [api, secret, headers, jellyfin]);

  useEffect(() => {
    (async () => {
      await refreshStreamyfinPluginSettings();
    })();
  }, []);

  useEffect(() => {
    store.set(apiAtom, api);
  }, [api]);

  useInterval(pollQuickConnect, isPolling ? 1000 : null);

  // Refresh plugin settings when the app comes to the foreground.
  //
  // Through a ref rather than a dependency: re-registering the listener every
  // time the refresh callback changes is churn, and registering once with the
  // callback captured is how the refresh kept running against the api of the
  // first render. Switch account without restarting the process and it went to
  // the previous server with the previous token, which comes back as a 401 on
  // a server the user is no longer using.
  const refreshPluginSettingsRef = useRef(refreshStreamyfinPluginSettings);
  useEffect(() => {
    refreshPluginSettingsRef.current = refreshStreamyfinPluginSettings;
  }, [refreshStreamyfinPluginSettings]);

  useEffect(() => onAppForeground(() => refreshPluginSettingsRef.current), []);

  const discoverServers = async (url: string): Promise<Server[]> => {
    const servers =
      await jellyfin?.discovery.getRecommendedServerCandidates(url);
    return servers?.map((server) => ({ address: server.address })) || [];
  };

  const setServerMutation = useMutation({
    mutationFn: async (server: Server) => {
      clearTVDiscoverySafely();
      const apiInstance =
        jellyfin && createApiWithCustomHeaders(jellyfin, server.address);

      if (!apiInstance?.basePath) throw new Error("Failed to connect");

      writeInfoLog(`Server set: ${server.address}`);
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
      clearTVDiscoverySafely();
      storage.remove("serverUrl");
      setApi(null);
    },
    onError: (error) => {
      console.error("Failed to remove server:", error);
    },
  });

  // Persist the CURRENT session to secure storage — used by the post-login
  // save-account modal (the protection picker shows AFTER a successful
  // login, for both the password and Quick Connect flows).
  const saveCurrentAccount = useCallback(
    async (options?: {
      securityType?: AccountSecurityType;
      pinCode?: string;
      serverName?: string;
    }) => {
      const token = storage.getString("token");
      if (!api?.basePath || !user?.Id || !user.Name || !token) return;
      const securityType = options?.securityType || "none";
      let pinHash: string | undefined;
      if (securityType === "pin") {
        // Never persist a "pin" credential without its hash — it would be
        // impossible to unlock.
        if (!options?.pinCode) throw new Error("PIN code is required");
        pinHash = await hashPIN(options.pinCode);
      }
      await saveAccountCredential({
        serverUrl: api.basePath,
        serverName: options?.serverName || "",
        token,
        userId: user.Id,
        username: user.Name,
        savedAt: Date.now(),
        securityType,
        pinHash,
        primaryImageTag: user.PrimaryImageTag ?? undefined,
      });
    },
    [api?.basePath, user],
  );

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
        writeInfoLog(`Login: authenticating against ${api.basePath}`);
        const auth = await api.authenticateUserByName(username, password);

        if (auth.data.AccessToken && auth.data.User) {
          setUser(auth.data.User);
          storage.set("user", JSON.stringify(auth.data.User));
          setApi(
            createApiWithCustomHeaders(
              jellyfin,
              api.basePath,
              auth.data?.AccessToken,
            ),
          );
          storage.set("token", auth.data?.AccessToken);

          // Save credentials to secure storage if requested
          if (api.basePath && options?.saveAccount) {
            const securityType = options.securityType || "none";
            let pinHash: string | undefined;

            if (securityType === "pin" && options.pinCode) {
              pinHash = await hashPIN(options.pinCode);
            }
            if (securityType === "pin" && !pinHash) {
              // Never persist a "pin" credential without its hash — it would be
              // impossible to unlock. Skip the save rather than failing a login
              // that already succeeded, and tell the user it didn't happen.
              writeErrorLog("Account save skipped: PIN required but missing");
              toast.error(t("save_account.not_saved"));
            } else {
              await saveAccountCredential({
                serverUrl: api.basePath,
                serverName: serverName || "",
                token: auth.data.AccessToken,
                userId: auth.data.User.Id || "",
                username,
                savedAt: Date.now(),
                securityType,
                pinHash,
                primaryImageTag: auth.data.User.PrimaryImageTag ?? undefined,
              });
            }
          }

          const recentPluginSettings = await refreshStreamyfinPluginSettings();
          // With a plugin-provided API key the auto-connect effect signs in
          // without a password — don't start a password session here, and
          // don't store the password either.
          if (
            recentPluginSettings?.jellyseerrServerUrl?.value &&
            !recentPluginSettings?.jellyseerrApiKey?.value
          ) {
            const jellyseerrApi = new JellyseerrApi(
              recentPluginSettings.jellyseerrServerUrl.value,
              getIntegrationHeaders("jellyseerr"),
            );
            const jellyfinServerUrl = api.basePath;
            const jellyfinUserId = auth.data.User.Id;
            await jellyseerrApi.test().then((result) => {
              if (result.isValid && result.requiresPass) {
                jellyseerrApi
                  .login(username, password)
                  .then((seerrUser) => {
                    setJellyseerrUser(seerrUser);
                    // Remember the password so Jellyseerr can be signed in
                    // again on later launches — but only once it has proven
                    // to work. Jellyseerr authenticates with the password
                    // rather than the Jellyfin token, so there is no
                    // token-shaped alternative. Goes to the platform secure
                    // store, never MMKV; users who typed their own URL get
                    // nothing stored, and the autoLoginJellyseerr toggle
                    // opts out.
                    const autoLogin =
                      store.get(settingsAtom)?.autoLoginJellyseerr !== false;
                    if (jellyfinServerUrl && jellyfinUserId && autoLogin) {
                      saveJellyseerrPassword(
                        jellyfinServerUrl,
                        jellyfinUserId,
                        password,
                      ).catch((e) =>
                        writeErrorLog(
                          `Could not store Jellyseerr password: ${e}`,
                        ),
                      );
                    }
                  })
                  .catch((e) =>
                    writeErrorLog(
                      `Jellyseerr sign-in at login failed: ${
                        e instanceof Error ? e.message : e
                      }`,
                    ),
                  );
              }
            });
          }
        }
      } catch (error) {
        // Wrong credentials and unreachable servers are the user's input and
        // environment, not app defects — log them as WARN locally. Nothing
        // here reaches Sentry directly; unexpected errors rethrown below are
        // reported once by the global mutation handler.
        writeToLog(
          axios.isAxiosError(error) &&
            (!error.response || error.response.status === 401)
            ? "WARN"
            : "ERROR",
          `Login failed against ${api.basePath}: ${describeRequestError(error)}`,
        );
        if (axios.isAxiosError(error)) {
          // What's thrown from here is only a translated message for the
          // login form, so it's marked expected to keep it out of Sentry's
          // global mutation handler.
          switch (error.response?.status) {
            case 401:
              throw markExpectedError(
                new Error(t("login.invalid_username_or_password")),
              );
            case 403:
              throw markExpectedError(
                new Error(t("login.user_does_not_have_permission_to_log_in")),
              );
            case 408:
              throw markExpectedError(
                new Error(
                  t(
                    "login.server_is_taking_too_long_to_respond_try_again_later",
                  ),
                ),
              );
            case 429:
              throw markExpectedError(
                new Error(
                  t("login.server_received_too_many_requests_try_again_later"),
                ),
              );
            case 500:
              throw markExpectedError(
                new Error(t("login.there_is_a_server_error")),
              );
            default:
              throw markExpectedError(
                new Error(
                  t(
                    "login.an_unexpected_error_occurred_did_you_enter_the_correct_url",
                  ),
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
      // Fire-and-forget: don't block logout on server cleanup
      api
        ?.delete(`/Streamyfin/device/${deviceId}`)
        .then((_r) => writeInfoLog("Deleted expo push token for device"))
        .catch((_e) =>
          writeErrorLog("Failed to delete expo push token for device"),
        );

      await clearSessionState();
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
      const apiInstance = createApiWithCustomHeaders(
        jellyfin,
        serverUrl,
        credential.token,
      );
      if (!apiInstance) {
        throw new Error("Failed to create API instance");
      }

      // Validate token by fetching current user
      try {
        const response = await getUserApi(apiInstance).getCurrentUser();

        // Clear React Query cache to prevent data from previous account lingering
        queryClient.clear();
        storage.remove("REACT_QUERY_OFFLINE_CACHE");

        // Token is valid, update state
        setApi(apiInstance);
        setUser(response.data);
        storage.set("serverUrl", serverUrl);
        storage.set("token", credential.token);
        storage.set("user", JSON.stringify(response.data));

        // Update account info (in case user changed their avatar)
        if (response.data.PrimaryImageTag !== credential.primaryImageTag) {
          addAccountToServer(serverUrl, credential.serverName, {
            userId: credential.userId,
            username: credential.username,
            securityType: credential.securityType,
            savedAt: credential.savedAt,
            primaryImageTag: response.data.PrimaryImageTag ?? undefined,
          });
        }

        // Refresh plugin settings
        await refreshStreamyfinPluginSettings();
      } catch (error) {
        // Check for axios error
        if (axios.isAxiosError(error)) {
          // Token is invalid/expired - remove it
          if (
            error.response?.status === 401 ||
            error.response?.status === 403
          ) {
            await deleteAccountCredential(serverUrl, userId);
            throw markExpectedError(new Error(t("server.session_expired")));
          }

          // Network error - server not reachable (no response means server didn't respond)
          if (!error.response) {
            throw markExpectedError(new Error(t("home.server_unreachable")));
          }
        }

        // Check for network error by message pattern (fallback detection)
        if (
          error instanceof Error &&
          (error.message.toLowerCase().includes("network") ||
            error.message.toLowerCase().includes("econnrefused") ||
            error.message.toLowerCase().includes("timeout"))
        ) {
          throw markExpectedError(new Error(t("home.server_unreachable")));
        }

        throw error;
      }
    },
    onError: (error) => {
      // Expected, handled case (e.g. revoked token → "Session Expired", or
      // server unreachable): the UI surfaces the message, so warn, don't error.
      console.warn("Quick login failed:", error);
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
      const apiInstance = createApiWithCustomHeaders(jellyfin, serverUrl);
      if (!apiInstance) {
        throw new Error("Failed to create API instance");
      }

      // Authenticate with password
      writeInfoLog(`Login (saved server): authenticating against ${serverUrl}`);
      const auth = await apiInstance
        .authenticateUserByName(username, password)
        .catch((error) => {
          writeToLog(
            axios.isAxiosError(error) &&
              (!error.response || error.response.status === 401)
              ? "WARN"
              : "ERROR",
            `Login (saved server) failed against ${serverUrl}: ${describeRequestError(error)}`,
          );
          throw error;
        });

      if (auth.data.AccessToken && auth.data.User) {
        // Clear React Query cache to prevent data from previous account lingering
        queryClient.clear();
        storage.remove("REACT_QUERY_OFFLINE_CACHE");

        setUser(auth.data.User);
        storage.set("user", JSON.stringify(auth.data.User));
        setApi(
          createApiWithCustomHeaders(
            jellyfin,
            serverUrl,
            auth.data.AccessToken,
          ),
        );
        storage.set("serverUrl", serverUrl);
        storage.set("token", auth.data.AccessToken);

        // Update the saved credential with new token and image tag
        await updateAccountToken(
          serverUrl,
          auth.data.User.Id || "",
          auth.data.AccessToken,
          auth.data.User.PrimaryImageTag ?? undefined,
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

  const switchServerUrl = useCallback(
    (newUrl: string) => {
      if (!jellyfin || !api?.accessToken) return;

      clearTVDiscoverySafely();
      const newApi = createApiWithCustomHeaders(
        jellyfin,
        newUrl,
        api.accessToken,
      );
      setApi(newApi);
      // Note: We don't update storage.set("serverUrl") here
      // because we want to keep the original remote URL as the "primary" URL
    },
    [jellyfin, api?.accessToken],
  );

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
          const apiInstance = createApiWithCustomHeaders(
            jellyfin,
            serverUrl,
            token,
          );
          setApi(apiInstance);

          if (storedUser?.Id) {
            setUser(storedUser);
          }

          // Validate the token and refresh user data in the background. Do NOT
          // await this: the Jellyfin SDK axios instance has no timeout, so when
          // offline this call hangs for the full OS TCP timeout (75-120s) and
          // blocks splash dismissal. The cached storedUser (set above) is enough
          // to render; on success we just refresh it.
          getUserApi(apiInstance)
            .getCurrentUser()
            .then(async (response) => {
              // The response can resolve long after startup (no axios timeout).
              // If the session changed meanwhile (logout, account switch), drop
              // it instead of repopulating a stale user / re-saving credentials.
              if (getTokenFromStorage() !== token) return;
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
                    primaryImageTag: response.data.PrimaryImageTag ?? undefined,
                  });
                } else if (
                  response.data.PrimaryImageTag !==
                  existingCredential.primaryImageTag
                ) {
                  // Update image tag if it has changed
                  addAccountToServer(serverUrl, existingCredential.serverName, {
                    userId: existingCredential.userId,
                    username: existingCredential.username,
                    securityType: existingCredential.securityType,
                    savedAt: existingCredential.savedAt,
                    primaryImageTag: response.data.PrimaryImageTag ?? undefined,
                  });
                }
              }
            })
            .catch((e) => {
              // Expected, handled case (offline, or a token the server rejects —
              // the UI prompts re-login): warn, don't error. Log only
              // status/message — never the raw error (axios errors carry the
              // request config incl. the Authorization header / token).
              console.warn(
                "Background user validation failed:",
                e?.response?.status ?? e?.message ?? "unknown error",
              );
            });
        }
      } catch (e) {
        // A failure here silently drops the user into an unauthenticated
        // state at launch, so it must be visible in crash reports.
        logAndCaptureError("Jellyfin startup initialization failed", e);
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
    saveCurrentAccount,
    logout: () => logoutMutation.mutateAsync(),
    initiateQuickConnect,
    stopQuickConnectPolling,
    loginWithSavedCredential: (serverUrl, userId) =>
      loginWithSavedCredentialMutation.mutateAsync({ serverUrl, userId }),
    loginWithPassword: (serverUrl, username, password) =>
      loginWithPasswordMutation.mutateAsync({ serverUrl, username, password }),
    removeSavedCredential: (serverUrl, userId) =>
      removeSavedCredentialMutation.mutateAsync({ serverUrl, userId }),
    switchServerUrl,
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
  const router = useRouter();

  useEffect(() => {
    if (loaded === false) return;

    const inAuthGroup = segments.length > 1 && segments[0] === "(auth)";
    const isTopShelfLaunchRoute = segments[0] === "topshelf";

    if (!user?.Id && inAuthGroup) {
      router.replace("/login");
    } else if (user?.Id && !inAuthGroup && !isTopShelfLaunchRoute) {
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
