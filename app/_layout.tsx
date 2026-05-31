import "@/augmentations";
import { ActionSheetProvider } from "@expo/react-native-action-sheet";
import NetInfo from "@react-native-community/netinfo";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { onlineManager, QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import * as BackgroundTask from "expo-background-task";
import * as Device from "expo-device";
import { DarkTheme, ThemeProvider } from "expo-router/react-navigation";
import { Platform } from "react-native";
import { GlobalModal } from "@/components/GlobalModal";
import { enableTVMenuKeyInterception } from "@/hooks/useTVBackHandler";
import i18n from "@/i18n";
import { DownloadProvider } from "@/providers/DownloadProvider";
import { GlobalModalProvider } from "@/providers/GlobalModalProvider";
import { InactivityProvider } from "@/providers/InactivityProvider";
import { IntroSheetProvider } from "@/providers/IntroSheetProvider";
import {
  apiAtom,
  getOrSetDeviceId,
  JellyfinProvider,
} from "@/providers/JellyfinProvider";
import { MusicPlayerProvider } from "@/providers/MusicPlayerProvider";
import { NetworkStatusProvider } from "@/providers/NetworkStatusProvider";
import { PlaySettingsProvider } from "@/providers/PlaySettingsProvider";
import { ServerUrlProvider } from "@/providers/ServerUrlProvider";
import { WebSocketProvider } from "@/providers/WebSocketProvider";
import { useSettings } from "@/utils/atoms/settings";
import {
  BACKGROUND_FETCH_TASK,
  BACKGROUND_FETCH_TASK_SESSIONS,
  registerBackgroundFetchAsyncSessions,
} from "@/utils/background-tasks";
import {
  LogProvider,
  writeErrorLog,
  writeInfoLog,
  writeToLog,
} from "@/utils/log";
import { storage } from "@/utils/mmkv";

const Notifications = !Platform.isTV ? require("expo-notifications") : null;

import { getSessionApi } from "@jellyfin/sdk/lib/utils/api/session-api";
import { getLocales } from "expo-localization";
import type { EventSubscription } from "expo-modules-core";
import type {
  Notification,
  NotificationResponse,
} from "expo-notifications/build/Notifications.types";
import type { ExpoPushToken } from "expo-notifications/build/Tokens.types";
import { Stack, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as TaskManager from "expo-task-manager";
import { Provider as JotaiProvider, useAtom } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import { I18nextProvider } from "react-i18next";
import { Appearance, LogBox } from "react-native";
import { SystemBars } from "react-native-edge-to-edge";
import { GestureHandlerRootView } from "react-native-gesture-handler";

// Suppress harmless tvOS warning from react-native-gesture-handler
if (Platform.isTV) {
  LogBox.ignoreLogs(["HoverGestureHandler is not supported on tvOS"]);
}

import useRouter from "@/hooks/useAppRouter";
import { userAtom } from "@/providers/JellyfinProvider";
import { store as jotaiStore, store } from "@/utils/store";
import "react-native-reanimated";
import {
  configureReanimatedLogger,
  ReanimatedLogLevel,
} from "react-native-reanimated";
import { Toaster } from "sonner-native";

// Disable strict mode warnings for reading shared values during render
configureReanimatedLogger({
  level: ReanimatedLogLevel.warn,
  strict: false,
});

if (!Platform.isTV) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

// Set the animation options. This is optional.
SplashScreen.setOptions({
  duration: 500,
  fade: true,
});

function useNotificationObserver() {
  const router = useRouter();

  useEffect(() => {
    if (Platform.isTV) return;

    let isMounted = true;

    Notifications.getLastNotificationResponseAsync().then(
      (response: { notification: any }) => {
        if (!isMounted || !response?.notification) {
          return;
        }
        const url = response?.notification.request.content.data?.url;
        if (url) {
          router.push(url);
        }
      },
    );

    return () => {
      isMounted = false;
    };
  }, [router]);
}

if (!Platform.isTV) {
  TaskManager.defineTask(BACKGROUND_FETCH_TASK_SESSIONS, async () => {
    console.log("TaskManager ~ sessions trigger");

    const api = store.get(apiAtom);
    if (api === null || api === undefined) return;

    const response = await getSessionApi(api).getSessions({
      activeWithinSeconds: 360,
    });

    const result = response.data.filter((s) => s.NowPlayingItem);
    Notifications.setBadgeCountAsync(result.length);

    return BackgroundTask.BackgroundTaskResult.Success;
  });

  TaskManager.defineTask(BACKGROUND_FETCH_TASK, async () => {
    console.log("TaskManager ~ trigger");
    // Background fetch task placeholder - currently unused
    return BackgroundTask.BackgroundTaskResult.Success;
  });
}

const checkAndRequestPermissions = async () => {
  try {
    const hasAskedBefore = storage.getString(
      "hasAskedForNotificationPermission",
    );
    let granted = false;
    if (hasAskedBefore !== "true") {
      const { status } = await Notifications.requestPermissionsAsync();
      granted = status === "granted";
      if (granted) {
        writeToLog("INFO", "Notification permissions granted.");
        console.log("Notification permissions granted.");
      } else {
        writeToLog("ERROR", "Notification permissions denied.");
        console.log("Notification permissions denied.");
      }
      storage.set("hasAskedForNotificationPermission", "true");
    } else {
      // Already asked before, check current status
      const { status } = await Notifications.getPermissionsAsync();
      granted = status === "granted";
      if (!granted) {
        writeToLog(
          "ERROR",
          "Notification permissions denied (already asked before).",
        );
        console.log("Notification permissions denied (already asked before).");
      }
    }
    return granted;
  } catch (error) {
    writeToLog(
      "ERROR",
      "Error checking/requesting notification permissions:",
      error,
    );
    console.error("Error checking/requesting notification permissions:", error);
    return false;
  }
};

export default function RootLayout() {
  Appearance.setColorScheme("dark");

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <JotaiProvider store={jotaiStore}>
        <ActionSheetProvider>
          <I18nextProvider i18n={i18n}>
            <Layout />
          </I18nextProvider>
        </ActionSheetProvider>
      </JotaiProvider>
    </GestureHandlerRootView>
  );
}

// Set up online manager for network-aware query behavior
onlineManager.setEventListener((setOnline) => {
  return NetInfo.addEventListener((state) => {
    setOnline(!!state.isConnected);
  });
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0, // Always stale - triggers background refetch on mount
      gcTime: 1000 * 60 * 60 * 24, // 24 hours - keep in cache for offline
      networkMode: "offlineFirst", // Return cache first, refetch if online
      refetchOnMount: true, // Refetch when component mounts
      refetchOnReconnect: true, // Refetch when network reconnects
      refetchOnWindowFocus: false, // Not needed for mobile
      retry: (failureCount) => {
        if (!onlineManager.isOnline()) return false;
        return failureCount < 3;
      },
    },
    mutations: {
      networkMode: "online", // Only run mutations when online
    },
  },
});

// Create MMKV-based persister for offline support
const mmkvPersister = createSyncStoragePersister({
  storage: {
    getItem: (key) => storage.getString(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.remove(key),
  },
});

function Layout() {
  const { settings } = useSettings();
  const [user] = useAtom(userAtom);
  const [api] = useAtom(apiAtom);
  const _segments = useSegments();
  const router = useRouter();

  // Enable TV menu key interception so React Native handles it instead of tvOS
  useEffect(() => {
    enableTVMenuKeyInterception();
  }, []);

  useEffect(() => {
    i18n.changeLanguage(
      settings?.preferedLanguage ?? getLocales()[0].languageCode ?? "en",
    );
  }, [settings?.preferedLanguage, i18n]);

  useNotificationObserver();

  const [expoPushToken, setExpoPushToken] = useState<ExpoPushToken>();
  const notificationListener = useRef<EventSubscription>(null);
  const responseListener = useRef<EventSubscription>(null);

  useEffect(() => {
    if (!Platform.isTV && expoPushToken && api && user) {
      api
        ?.post("/Streamyfin/device", {
          token: expoPushToken.data,
          deviceId: getOrSetDeviceId(),
          userId: user.Id,
        })
        .catch((_) =>
          writeErrorLog("Failed to push expo push token to plugin"),
        );
    }
  }, [api, expoPushToken, user]);

  const registerNotifications = useCallback(async () => {
    if (Platform.OS === "android") {
      await Notifications?.setNotificationChannelAsync("default", {
        name: "default",
      });

      // Create dedicated channel for download notifications
      await Notifications?.setNotificationChannelAsync("downloads", {
        name: "Downloads",
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#FF231F7C",
      });
    }

    const granted = await checkAndRequestPermissions();
    if (!granted) {
      console.log(
        "Notification permissions not granted, skipping background fetch and push token registration.",
      );
      return;
    }

    if (!Platform.isTV && user && user.Policy?.IsAdministrator) {
      await registerBackgroundFetchAsyncSessions();
    }

    // only create push token for real devices (pointless for emulators)
    if (Device.isDevice) {
      Notifications?.getExpoPushTokenAsync({
        projectId: "e79219d1-797f-4fbe-9fa1-cfd360690a68",
      })
        .then((token: ExpoPushToken) => {
          if (token) {
            console.log("Expo push token obtained:", token.data);
            setExpoPushToken(token);
          }
        })
        .catch((reason: any) => {
          console.error("Failed to get push token:", reason);
          writeErrorLog("Failed to get Expo push token", reason);
        });
    }
  }, [user]);

  useEffect(() => {
    if (!Platform.isTV) {
      void registerNotifications();

      notificationListener.current =
        Notifications?.addNotificationReceivedListener(
          (notification: Notification) => {
            console.log(
              "Notification received while app running",
              notification,
            );
          },
        );

      responseListener.current =
        Notifications?.addNotificationResponseReceivedListener(
          (response: NotificationResponse) => {
            // Currently the notifications supported by the plugin will send data for deep links.
            const { title, data } = response.notification.request.content;
            writeInfoLog(`Notification ${title} opened`, data);

            let url: any;
            const type = (data?.type ?? "").toString().toLowerCase();
            const itemId = data?.id;

            switch (type) {
              case "movie":
                url = `/(auth)/(tabs)/home/items/page?id=${itemId}`;
                break;
              case "episode":
                // `/(auth)/(tabs)/${from}/items/page?id=${item.Id}`;
                // We just clicked a notification for an individual episode.
                if (itemId) {
                  url = `/(auth)/(tabs)/home/items/page?id=${itemId}`;
                  // summarized season notification for multiple episodes. Bring them to series season
                } else {
                  const seriesId = data?.seriesId;
                  const seasonIndex = data?.seasonIndex;
                  if (seasonIndex) {
                    url = `/(auth)/(tabs)/home/series/${seriesId}?seasonIndex=${seasonIndex}`;
                  } else {
                    url = `/(auth)/(tabs)/home/series/${seriesId}`;
                  }
                }
                break;
            }

            writeInfoLog(`Notification attempting to redirect to ${url}`);
            if (url) {
              router.push(url);
            }
          },
        );

      return () => {
        notificationListener.current?.remove();
        responseListener.current?.remove();
      };
    }
  }, [user]);

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: mmkvPersister,
        maxAge: 1000 * 60 * 60 * 24, // 24 hours max cache age
        dehydrateOptions: {
          shouldDehydrateQuery: (query) => {
            return (
              query.state.status === "success" && query.options.gcTime !== 0
            );
          },
        },
      }}
    >
      <JellyfinProvider>
        <InactivityProvider>
          <ServerUrlProvider>
            <NetworkStatusProvider>
              <PlaySettingsProvider>
                <LogProvider>
                  <WebSocketProvider>
                    <DownloadProvider>
                      <MusicPlayerProvider>
                        <GlobalModalProvider>
                          <IntroSheetProvider>
                            <ThemeProvider value={DarkTheme}>
                              <SystemBars style='light' hidden={false} />
                              <Stack initialRouteName='(auth)/(tabs)'>
                                <Stack.Screen
                                  name='(auth)/(tabs)'
                                  options={{
                                    headerShown: false,
                                    title: "",
                                    header: () => null,
                                  }}
                                />
                                <Stack.Screen
                                  name='(auth)/player'
                                  options={{
                                    headerShown: false,
                                    title: "",
                                    header: () => null,
                                  }}
                                />
                                <Stack.Screen
                                  name='(auth)/now-playing'
                                  options={{
                                    headerShown: false,
                                    presentation: "modal",
                                    gestureEnabled: true,
                                  }}
                                />
                                <Stack.Screen
                                  name='login'
                                  options={{
                                    headerShown: true,
                                    title: "",
                                    headerTransparent: Platform.OS === "ios",
                                  }}
                                />
                                <Stack.Screen name='+not-found' />
                                <Stack.Screen
                                  name='(auth)/tv-option-modal'
                                  options={{
                                    headerShown: false,
                                    presentation: "transparentModal",
                                    animation: "fade",
                                  }}
                                />
                                <Stack.Screen
                                  name='(auth)/tv-subtitle-modal'
                                  options={{
                                    headerShown: false,
                                    presentation: "transparentModal",
                                    animation: "fade",
                                  }}
                                />
                                <Stack.Screen
                                  name='(auth)/tv-request-modal'
                                  options={{
                                    headerShown: false,
                                    presentation: "transparentModal",
                                    animation: "fade",
                                  }}
                                />
                                <Stack.Screen
                                  name='(auth)/tv-season-select-modal'
                                  options={{
                                    headerShown: false,
                                    presentation: "transparentModal",
                                    animation: "fade",
                                  }}
                                />
                                <Stack.Screen
                                  name='(auth)/tv-series-season-modal'
                                  options={{
                                    headerShown: false,
                                    presentation: "transparentModal",
                                    animation: "fade",
                                  }}
                                />
                                <Stack.Screen
                                  name='tv-account-action-modal'
                                  options={{
                                    headerShown: false,
                                    presentation: "transparentModal",
                                    animation: "fade",
                                  }}
                                />
                                <Stack.Screen
                                  name='tv-account-select-modal'
                                  options={{
                                    headerShown: false,
                                    presentation: "transparentModal",
                                    animation: "fade",
                                  }}
                                />
                                <Stack.Screen
                                  name='(auth)/tv-user-switch-modal'
                                  options={{
                                    headerShown: false,
                                    presentation: "transparentModal",
                                    animation: "fade",
                                  }}
                                />
                              </Stack>
                              <Toaster
                                duration={4000}
                                toastOptions={{
                                  style: {
                                    backgroundColor: "#262626",
                                    borderColor: "#363639",
                                    borderWidth: 1,
                                  },
                                  titleStyle: {
                                    color: "white",
                                  },
                                }}
                                closeButton
                              />
                              {!Platform.isTV && <GlobalModal />}
                            </ThemeProvider>
                          </IntroSheetProvider>
                        </GlobalModalProvider>
                      </MusicPlayerProvider>
                    </DownloadProvider>
                  </WebSocketProvider>
                </LogProvider>
              </PlaySettingsProvider>
            </NetworkStatusProvider>
          </ServerUrlProvider>
        </InactivityProvider>
      </JellyfinProvider>
    </PersistQueryClientProvider>
  );
}
