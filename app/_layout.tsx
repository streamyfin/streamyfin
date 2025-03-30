import "@/augmentations";
import i18n from "@/i18n";
import { DownloadProvider } from "@/providers/DownloadProvider";
import {
  JellyfinProvider,
  apiAtom,
  getOrSetDeviceId,
  getTokenFromStorage,
} from "@/providers/JellyfinProvider";
import { JobQueueProvider } from "@/providers/JobQueueProvider";
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
import { cancelJobById, getAllJobsByDeviceId } from "@/utils/optimize-server";
import { ActionSheetProvider } from "@expo/react-native-action-sheet";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { Platform } from "react-native";
const BackGroundDownloader = !Platform.isTV
  ? require("@kesha-antonov/react-native-background-downloader")
  : null;
import { DarkTheme, ThemeProvider } from "@react-navigation/native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const BackgroundFetch = !Platform.isTV
  ? require("expo-background-fetch")
  : null;
import * as Device from "expo-device";
import * as FileSystem from "expo-file-system";
const Notifications = !Platform.isTV ? require("expo-notifications") : null;
import * as ScreenOrientation from "@/packages/expo-screen-orientation";
import { Stack, router, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
const TaskManager = !Platform.isTV ? require("expo-task-manager") : null;
import { getLocales } from "expo-localization";
import { Provider as JotaiProvider } from "jotai";
import { useEffect, useRef, useState } from "react";
import { I18nextProvider } from "react-i18next";
import { AppState, Appearance } from "react-native";
import { SystemBars } from "react-native-edge-to-edge";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";
import { userAtom } from "@/providers/JellyfinProvider";
import { store } from "@/utils/store";
import { getSessionApi } from "@jellyfin/sdk/lib/utils/api/session-api";
import type { EventSubscription } from "expo-modules-core";
import type {
  Notification,
  NotificationResponse,
} from "expo-notifications/build/Notifications.types";
import type { ExpoPushToken } from "expo-notifications/build/Tokens.types";
import { useAtom } from "jotai";
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

function useNotificationObserver() {
  if (Platform.isTV) return;

  useEffect(() => {
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

    return BackgroundFetch.BackgroundFetchResult.NewData;
  });

  TaskManager.defineTask(BACKGROUND_FETCH_TASK, async () => {
    console.log("TaskManager ~ trigger");

    const now = Date.now();

    const settingsData = storage.getString("settings");

    if (!settingsData) return BackgroundFetch.BackgroundFetchResult.NoData;

    const settings: Partial<Settings> = JSON.parse(settingsData);
    const url = settings?.optimizedVersionsServerUrl;

    if (!settings?.autoDownload || !url)
      return BackgroundFetch.BackgroundFetchResult.NoData;

    const token = getTokenFromStorage();
    const deviceId = getOrSetDeviceId();
    const baseDirectory = FileSystem.documentDirectory;

    if (!token || !deviceId || !baseDirectory)
      return BackgroundFetch.BackgroundFetchResult.NoData;

    const jobs = await getAllJobsByDeviceId({
      deviceId,
      authHeader: token,
      url,
    });

    console.log("TaskManager ~ Active jobs: ", jobs.length);

    for (const job of jobs) {
      if (job.status === "completed") {
        const downloadUrl = `${url}download/${job.id}`;
        const tasks = await BackGroundDownloader.checkForExistingDownloads();

        if (tasks.find((task: { id: string }) => task.id === job.id)) {
          console.log("TaskManager ~ Download already in progress: ", job.id);
          continue;
        }

        BackGroundDownloader.download({
          id: job.id,
          url: downloadUrl,
          destination: `${baseDirectory}${job.item.Id}.mp4`,
          headers: {
            Authorization: token,
          },
        })
          .begin(() => {
            console.log("TaskManager ~ Download started: ", job.id);
          })
          .done(() => {
            console.log("TaskManager ~ Download completed: ", job.id);
            saveDownloadedItemInfo(job.item);
            BackGroundDownloader.completeHandler(job.id);
            cancelJobById({
              authHeader: token,
              id: job.id,
              url: url,
            });
            Notifications.scheduleNotificationAsync({
              content: {
                title: job.item.Name,
                body: "Download completed",
                data: {
                  url: "/downloads",
                },
              },
              trigger: null,
            });
          })
          .error((error: any) => {
            console.log("TaskManager ~ Download error: ", job.id, error);
            BackGroundDownloader.completeHandler(job.id);
            Notifications.scheduleNotificationAsync({
              content: {
                title: job.item.Name,
                body: "Download failed",
                data: {
                  url: "/downloads",
                },
              },
              trigger: null,
            });
          });
      }
    }

    console.log(`Auto download started: ${new Date(now).toISOString()}`);

    // Be sure to return the successful result type!
    return BackgroundFetch.BackgroundFetchResult.NewData;
  });
}

const checkAndRequestPermissions = async () => {
  try {
    const hasAskedBefore = storage.getString(
      "hasAskedForNotificationPermission",
    );

    if (hasAskedBefore !== "true") {
      const { status } = await Notifications.requestPermissionsAsync();

      if (status === "granted") {
        writeToLog("INFO", "Notification permissions granted.");
        console.log("Notification permissions granted.");
      } else {
        writeToLog("ERROR", "Notification permissions denied.");
        console.log("Notification permissions denied.");
      }

      storage.set("hasAskedForNotificationPermission", "true");
    } else {
      console.log("Already asked for notification permissions before.");
    }
  } catch (error) {
    writeToLog(
      "ERROR",
      "Error checking/requesting notification permissions:",
      error,
    );
    console.error("Error checking/requesting notification permissions:", error);
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

  if (!Platform.isTV) {
    useNotificationObserver();

    const [expoPushToken, setExpoPushToken] = useState<ExpoPushToken>();
    const notificationListener = useRef<EventSubscription>();
    const responseListener = useRef<EventSubscription>();

    useEffect(() => {
      if (expoPushToken && api && user) {
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

      await checkAndRequestPermissions();

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
      registerNotifications();

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
                  }
                  // summarized season notification for multiple episodes. Bring them to series season
                  else {
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
        notificationListener.current &&
          Notifications?.removeNotificationSubscription(
            notificationListener.current,
          );
        responseListener.current &&
          Notifications?.removeNotificationSubscription(
            responseListener.current,
          );
      };
    }, []);

    useEffect(() => {
      if (Platform.isTV) return;
      if (segments.includes("direct-player" as never)) {
        return;
      }

      // If the user has auto rotate enabled, unlock the orientation
      if (settings.followDeviceOrientation === true) {
        ScreenOrientation.unlockAsync();
      } else {
        // If the user has auto rotate disabled, lock the orientation to portrait
        ScreenOrientation.lockAsync(
          ScreenOrientation.OrientationLock.PORTRAIT_UP,
        );
      }
    }, [settings.followDeviceOrientation, segments]);

    useEffect(() => {
      const subscription = AppState.addEventListener(
        "change",
        (nextAppState) => {
          if (
            appState.current.match(/inactive|background/) &&
            nextAppState === "active"
          ) {
            BackGroundDownloader.checkForExistingDownloads();
          }
        },
      );

      BackGroundDownloader.checkForExistingDownloads();

      return () => {
        subscription.remove();
      };
    }, []);
  }

  return (
    <QueryClientProvider client={queryClient}>
      <JobQueueProvider>
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
      </JobQueueProvider>
    </QueryClientProvider>
  );
}

function saveDownloadedItemInfo(item: BaseItemDto) {
  try {
    const downloadedItems = storage.getString("downloadedItems");
    const items: BaseItemDto[] = downloadedItems
      ? JSON.parse(downloadedItems)
      : [];

    const existingItemIndex = items.findIndex((i) => i.Id === item.Id);
    if (existingItemIndex !== -1) {
      items[existingItemIndex] = item;
    } else {
      items.push(item);
    }

    storage.set("downloadedItems", JSON.stringify(items));
  } catch (error) {
    writeToLog("ERROR", "Failed to save downloaded item information:", error);
    console.error("Failed to save downloaded item information:", error);
  }
}
