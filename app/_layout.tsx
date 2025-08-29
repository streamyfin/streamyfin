import "@/augmentations";
import { ActionSheetProvider } from "@expo/react-native-action-sheet";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { Platform } from "react-native";
import i18n from "@/i18n";
import { DownloadProvider } from "@/providers/DownloadProvider";
import {
  apiAtom,
  getOrSetDeviceId,
  getTokenFromStorage,
  JellyfinProvider,
} from "@/providers/JellyfinProvider";
import { PlaySettingsProvider } from "@/providers/PlaySettingsProvider";
import { WebSocketProvider } from "@/providers/WebSocketProvider";
import { type Settings, useSettings } from "@/utils/atoms/settings";
import {
  BACKGROUND_FETCH_TASK,
  BACKGROUND_FETCH_TASK_SESSIONS,
  registerBackgroundFetchAsyncSessions,
} from "@/utils/background-tasks";
import {
  LogProvider,
  writeDebugLog,
  writeErrorLog,
  writeToLog,
} from "@/utils/log";
import { storage } from "@/utils/mmkv";

const BackGroundDownloader = !Platform.isTV
  ? require("@kesha-antonov/react-native-background-downloader")
  : null;

import { DarkTheme, ThemeProvider } from "@react-navigation/native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import * as BackgroundTask from "expo-background-task";

import * as Device from "expo-device";
import * as FileSystem from "expo-file-system";

const Notifications = !Platform.isTV ? require("expo-notifications") : null;

import { getLocales } from "expo-localization";
import { router, Stack, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";

import * as TaskManager from "expo-task-manager";
import { Provider as JotaiProvider } from "jotai";
import { useEffect, useRef, useState } from "react";
import { I18nextProvider } from "react-i18next";
import { Appearance, AppState } from "react-native";
import { SystemBars } from "react-native-edge-to-edge";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import * as ScreenOrientation from "@/packages/expo-screen-orientation";
import "react-native-reanimated";
import { getSessionApi } from "@jellyfin/sdk/lib/utils/api/session-api";
import type { EventSubscription } from "expo-modules-core";
import type {
  Notification,
  NotificationResponse,
} from "expo-notifications/build/Notifications.types";
import type { ExpoPushToken } from "expo-notifications/build/Tokens.types";
import { useAtom } from "jotai";
import { Toaster } from "sonner-native";
import { userAtom } from "@/providers/JellyfinProvider";
import { store } from "@/utils/store";

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
  useEffect(() => {
    if (Platform.isTV) return;

    let isMounted = true;

    function redirect(notification: typeof Notifications.Notification) {
      const url = notification.request.content.data?.url;
      if (url) {
        router.push(url);
      }
    }

    Notifications.getLastNotificationResponseAsync().then(
      (response: { notification: any }) => {
        if (!isMounted || !response?.notification) {
          return;
        }
        redirect(response?.notification);
      },
    );

    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response: { notification: any }) => {
        redirect(response.notification);
      },
    );

    return () => {
      isMounted = false;
      subscription.remove();
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

    const settingsData = storage.getString("settings");

    if (!settingsData) return BackgroundTask.BackgroundTaskResult.Failed;

    const settings: Partial<Settings> = JSON.parse(settingsData);

    if (!settings?.autoDownload)
      return BackgroundTask.BackgroundTaskResult.Failed;

    const token = getTokenFromStorage();
    const deviceId = getOrSetDeviceId();
    const baseDirectory = FileSystem.documentDirectory;

    if (!token || !deviceId || !baseDirectory)
      return BackgroundTask.BackgroundTaskResult.Failed;

    // Be sure to return the successful result type!
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
      staleTime: 0,
      refetchOnMount: true,
      refetchOnReconnect: true,
      refetchOnWindowFocus: true,
      retryOnMount: true,
    },
  },
});

function Layout() {
  const [settings] = useSettings();
  const [user] = useAtom(userAtom);
  const [api] = useAtom(apiAtom);
  const appState = useRef(AppState.currentState);
  const segments = useSegments();

  useEffect(() => {
    i18n.changeLanguage(
      settings?.preferedLanguage ?? getLocales()[0].languageCode ?? "en",
    );
  }, [settings?.preferedLanguage, i18n]);

  useNotificationObserver();

  const [expoPushToken, setExpoPushToken] = useState<ExpoPushToken>();
  const notificationListener = useRef<EventSubscription>();
  const responseListener = useRef<EventSubscription>();

  useEffect(() => {
    if (!Platform.isTV && expoPushToken && api && user) {
      api
        ?.post("/Streamyfin/device", {
          token: expoPushToken.data,
          deviceId: getOrSetDeviceId(),
          userId: user.Id,
        })
        .then((_) => console.log("Posted expo push token"))
        .catch((_) =>
          writeErrorLog("Failed to push expo push token to plugin"),
        );
    } else console.log("No token available");
  }, [api, expoPushToken, user]);

  async function registerNotifications() {
    if (Platform.OS === "android") {
      console.log("Setting android notification channel 'default'");
      await Notifications?.setNotificationChannelAsync("default", {
        name: "default",
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
      Notifications?.getExpoPushTokenAsync()
        .then((token: ExpoPushToken) => token && setExpoPushToken(token))
        .catch((reason: any) => console.log("Failed to get token", reason));
    }
  }

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
            writeDebugLog(
              `Notification ${title} opened`,
              response.notification.request.content,
            );
            if (data && Object.keys(data).length > 0) {
              const type = data?.type?.toLower?.();
              const itemId = data?.id;

              switch (type) {
                case "movie":
                  router.push(`/(auth)/(tabs)/home/items/page?id=${itemId}`);
                  break;
                case "episode":
                  // We just clicked a notification for an individual episode.
                  if (itemId) {
                    router.push(`/(auth)/(tabs)/home/items/page?id=${itemId}`);
                    // summarized season notification for multiple episodes. Bring them to series season
                  } else {
                    const seriesId = data.seriesId;
                    const seasonIndex = data.seasonIndex;
                    if (seasonIndex) {
                      router.push(
                        `/(auth)/(tabs)/home/series/${seriesId}?seasonIndex=${seasonIndex}`,
                      );
                    } else {
                      router.push(`/(auth)/(tabs)/home/series/${seriesId}`);
                    }
                  }
                  break;
              }
            }
          },
        );

      return () => {
        notificationListener.current?.remove();
        responseListener.current?.remove();
      };
    }
  }, [user, api]);

  useEffect(() => {
    if (Platform.isTV) {
      return;
    }

    if (segments.includes("direct-player" as never)) {
      if (
        !settings.followDeviceOrientation &&
        settings.defaultVideoOrientation
      ) {
        ScreenOrientation.lockAsync(settings.defaultVideoOrientation);
      }
      return;
    }

    if (settings.followDeviceOrientation === true) {
      ScreenOrientation.unlockAsync();
    } else {
      ScreenOrientation.lockAsync(
        ScreenOrientation.OrientationLock.PORTRAIT_UP,
      );
    }
  }, [
    settings.followDeviceOrientation,
    settings.defaultVideoOrientation,
    segments,
  ]);

  useEffect(() => {
    if (Platform.isTV) {
      return;
    }

    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === "active"
      ) {
        BackGroundDownloader.checkForExistingDownloads();
      }
    });

    BackGroundDownloader.checkForExistingDownloads();

    return () => {
      subscription.remove();
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <JellyfinProvider>
        <PlaySettingsProvider>
          <LogProvider>
            <WebSocketProvider>
              <DownloadProvider>
                <BottomSheetModalProvider>
                  <SystemBars style='light' hidden={false} />
                  <ThemeProvider value={DarkTheme}>
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
                          headerTransparent: true,
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
                  </ThemeProvider>
                </BottomSheetModalProvider>
              </DownloadProvider>
            </WebSocketProvider>
          </LogProvider>
        </PlaySettingsProvider>
      </JellyfinProvider>
    </QueryClientProvider>
  );
}
