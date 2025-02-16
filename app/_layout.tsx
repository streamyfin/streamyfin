import "@/augmentations";
import { Platform } from "react-native";
import { Text } from "@/components/common/Text";
import i18n from "@/i18n";
import { DownloadProvider } from "@/providers/DownloadProvider";
import {
  getOrSetDeviceId,
  getTokenFromStorage,
  JellyfinProvider,
} from "@/providers/JellyfinProvider";
import { JobQueueProvider } from "@/providers/JobQueueProvider";
import { PlaySettingsProvider } from "@/providers/PlaySettingsProvider";
import {
  SplashScreenProvider,
  useSplashScreenLoading,
} from "@/providers/SplashScreenProvider";
import { WebSocketProvider } from "@/providers/WebSocketProvider";
import { Settings, useSettings } from "@/utils/atoms/settings";
import { BACKGROUND_FETCH_TASK } from "@/utils/background-tasks";
import { LogProvider, writeToLog } from "@/utils/log";
import { storage } from "@/utils/mmkv";
import { cancelJobById, getAllJobsByDeviceId } from "@/utils/optimize-server";
import { ActionSheetProvider } from "@expo/react-native-action-sheet";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
const BackGroundDownloader = !Platform.isTV
  ? require("@kesha-antonov/react-native-background-downloader")
  : null;
import { DarkTheme, ThemeProvider } from "@react-navigation/native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const BackgroundFetch = !Platform.isTV
  ? require("expo-background-fetch")
  : null;
import * as FileSystem from "expo-file-system";
import { useFonts } from "expo-font";
import { useKeepAwake } from "expo-keep-awake";
const Notifications = !Platform.isTV ? require("expo-notifications") : null;
import { router, Stack } from "expo-router";
import * as ScreenOrientation from "@/packages/expo-screen-orientation";
const TaskManager = !Platform.isTV ? require("expo-task-manager") : null;
import { getLocales } from "expo-localization";
import { Provider as JotaiProvider } from "jotai";
import { useEffect, useRef } from "react";
import { I18nextProvider, useTranslation } from "react-i18next";
import { Appearance, AppState } from "react-native";
import { SystemBars } from "react-native-edge-to-edge";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";
import { Toaster } from "sonner-native";
import { NativeDownloadProvider } from "@/providers/NativeDownloadProvider";

if (!Platform.isTV) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

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
      }
    );

    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response: { notification: any }) => {
        redirect(response.notification);
      }
    );

    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, []);
}

if (!Platform.isTV) {
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

    for (let job of jobs) {
      if (job.status === "completed") {
        const downloadUrl = url + "download/" + job.id;
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
                  url: `/downloads`,
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
                  url: `/downloads`,
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
      "hasAskedForNotificationPermission"
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
      error
    );
    console.error("Error checking/requesting notification permissions:", error);
  }
};

export default function RootLayout() {
  Appearance.setColorScheme("dark");

  return (
    <SplashScreenProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <JotaiProvider>
          <ActionSheetProvider>
            <I18nextProvider i18n={i18n}>
              <Layout />
            </I18nextProvider>
          </ActionSheetProvider>
        </JotaiProvider>
      </GestureHandlerRootView>
    </SplashScreenProvider>
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
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    i18n.changeLanguage(
      settings?.preferedLanguage ?? getLocales()[0].languageCode ?? "en"
    );
  }, [settings?.preferedLanguage, i18n]);

  if (!Platform.isTV) {
    useKeepAwake();
    useNotificationObserver();

    const { i18n } = useTranslation();

    useEffect(() => {
      checkAndRequestPermissions();
    }, []);

    useEffect(() => {
      // If the user has auto rotate enabled, unlock the orientation
      if (settings.autoRotate === true) {
        ScreenOrientation.unlockAsync();
      } else {
        // If the user has auto rotate disabled, lock the orientation to portrait
        ScreenOrientation.lockAsync(
          ScreenOrientation.OrientationLock.PORTRAIT_UP
        );
      }
    }, [settings]);

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
        }
      );

      BackGroundDownloader.checkForExistingDownloads();

      return () => {
        subscription.remove();
      };
    }, []);
  }

  const [loaded] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });

  useSplashScreenLoading(!loaded);

  if (!loaded) {
    return null;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <JobQueueProvider>
        <JellyfinProvider>
          <PlaySettingsProvider>
            <LogProvider>
              <WebSocketProvider>
                <DownloadProvider>
                  <NativeDownloadProvider>
                    <BottomSheetModalProvider>
                      <SystemBars style="light" hidden={false} />
                      <ThemeProvider value={DarkTheme}>
                        <Stack>
                          <Stack.Screen
                            name="(auth)/(tabs)"
                            options={{
                              headerShown: false,
                              title: "",
                              header: () => null,
                            }}
                          />
                          <Stack.Screen
                            name="(auth)/player"
                            options={{
                              headerShown: false,
                              title: "",
                              header: () => null,
                            }}
                          />
                          <Stack.Screen
                            name="login"
                            options={{
                              headerShown: true,
                              title: "",
                              headerTransparent: true,
                            }}
                          />
                          <Stack.Screen name="+not-found" />
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
                  </NativeDownloadProvider>
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
    let items: BaseItemDto[] = downloadedItems
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
