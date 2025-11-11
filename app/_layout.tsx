import "@/augmentations";
import { ActionSheetProvider } from "@expo/react-native-action-sheet";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { DarkTheme, ThemeProvider } from "@react-navigation/native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as BackgroundTask from "expo-background-task";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { GlobalModal } from "@/components/GlobalModal";
import i18n from "@/i18n";
import { DownloadProvider } from "@/providers/DownloadProvider";
import { GlobalModalProvider } from "@/providers/GlobalModalProvider";
import {
  apiAtom,
  getOrSetDeviceId,
  JellyfinProvider,
} from "@/providers/JellyfinProvider";
import { PlaySettingsProvider } from "@/providers/PlaySettingsProvider";
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
import { getDevicePushTokenAsync } from "expo-notifications";
import type {
  Notification,
  NotificationResponse,
} from "expo-notifications/build/Notifications.types";
import type { DevicePushToken } from "expo-notifications/build/Tokens.types";
import { router, Stack, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as TaskManager from "expo-task-manager";
import { Provider as JotaiProvider, useAtom } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import { I18nextProvider } from "react-i18next";
import { Appearance } from "react-native";
import { SystemBars } from "react-native-edge-to-edge";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { userAtom } from "@/providers/JellyfinProvider";
import { store } from "@/utils/store";
import "react-native-reanimated";
import { Toaster } from "sonner-native";

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

function redirect(notification: typeof Notifications.Notification) {
  const url = notification.request.content.data?.url;
  if (url) {
    router.push(url);
  }
}

function useNotificationObserver() {
  useEffect(() => {
    if (Platform.isTV) return;

    let isMounted = true;

    Notifications.getLastNotificationResponseAsync().then(
      (response: { notification: any }) => {
        if (!isMounted || !response?.notification) {
          return;
        }
        redirect(response?.notification);
      },
    );

    return () => {
      isMounted = false;
    };
  }, []);
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
      <JotaiProvider>
        <ActionSheetProvider>
          <I18nextProvider i18n={i18n}>
            <Layout />
          </I18nextProvider>
        </ActionSheetProvider>
      </JotaiProvider>
    </GestureHandlerRootView>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
    },
  },
});

function Layout() {
  const { settings } = useSettings();
  const [user] = useAtom(userAtom);
  const [api] = useAtom(apiAtom);
  const _segments = useSegments();

  useEffect(() => {
    i18n.changeLanguage(
      settings?.preferedLanguage ?? getLocales()[0].languageCode ?? "en",
    );
  }, [settings?.preferedLanguage, i18n]);

  useNotificationObserver();

  const [pushToken, setPushToken] = useState<DevicePushToken>();
  const notificationListener = useRef<EventSubscription>(null);
  const responseListener = useRef<EventSubscription>(null);

  useEffect(() => {
    if (!Platform.isTV && pushToken && api && user) {
      api
        ?.post("/Streamyfin/device", {
          token: pushToken.data,
          deviceId: getOrSetDeviceId(),
          userId: user.Id,
        })
        .then((_) => console.log("Posted device push token"))
        .catch((_) =>
          writeErrorLog("Failed to push device push token to plugin"),
        );
    } else console.log("No token available");
  }, [api, pushToken, user]);

  const registerNotifications = useCallback(async () => {
    if (Platform.OS === "android") {
      console.log("Setting android notification channel 'default'");
      await Notifications?.setNotificationChannelAsync("default", {
        name: "default",
      });

      // Create dedicated channel for download notifications
      console.log("Setting android notification channel 'downloads'");
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
      getDevicePushTokenAsync()
        .then((token: DevicePushToken) => token && setPushToken(token))
        .catch((reason: any) => console.log("Failed to get token", reason));
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
            // redirect if internal notification
            redirect(response?.notification);

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
                  const seriesId = data.seriesId;
                  const seasonIndex = data.seasonIndex;
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
    <QueryClientProvider client={queryClient}>
      <JellyfinProvider>
        <PlaySettingsProvider>
          <LogProvider>
            <WebSocketProvider>
              <DownloadProvider>
                <GlobalModalProvider>
                  <BottomSheetModalProvider>
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
                          name='login'
                          options={{
                            headerShown: true,
                            title: "",
                            headerTransparent: Platform.OS === "ios",
                          }}
                        />
                        <Stack.Screen name='+not-found' />
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
                      <GlobalModal />
                    </ThemeProvider>
                  </BottomSheetModalProvider>
                </GlobalModalProvider>
              </DownloadProvider>
            </WebSocketProvider>
          </LogProvider>
        </PlaySettingsProvider>
      </JellyfinProvider>
    </QueryClientProvider>
  );
}
