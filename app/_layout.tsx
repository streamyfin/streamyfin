import "@/augmentations";
import { Text } from "@/components/common/Text";
import { DownloadProvider } from "@/providers/DownloadProvider";
import {
  getOrSetDeviceId,
  getTokenFromStorage,
  JellyfinProvider,
} from "@/providers/JellyfinProvider";
import { JobQueueProvider } from "@/providers/JobQueueProvider";
import { PlaySettingsProvider } from "@/providers/PlaySettingsProvider";
import { SplashScreenProvider } from "@/providers/SplashScreenProvider";
import { WebSocketProvider } from "@/providers/WebSocketProvider";
import { orientationAtom } from "@/utils/atoms/orientation";
import { Settings, useSettings } from "@/utils/atoms/settings";
import { BACKGROUND_FETCH_TASK } from "@/utils/background-tasks";
import { LogProvider, writeToLog } from "@/utils/log";
import { storage } from "@/utils/mmkv";
import { cancelJobById, getAllJobsByDeviceId } from "@/utils/optimize-server";
import { ActionSheetProvider } from "@expo/react-native-action-sheet";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import {
  checkForExistingDownloads,
  completeHandler,
  download,
} from "@kesha-antonov/react-native-background-downloader";
import { DarkTheme, ThemeProvider } from "@react-navigation/native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as BackgroundFetch from "expo-background-fetch";
import * as FileSystem from "expo-file-system";
import { useFonts } from "expo-font";
import { useKeepAwake } from "expo-keep-awake";
import * as Linking from "expo-linking";
import * as Notifications from "expo-notifications";
import { router, Stack } from "expo-router";
import * as ScreenOrientation from "expo-screen-orientation";
import * as TaskManager from "expo-task-manager";
import { Provider as JotaiProvider, useAtom } from "jotai";
import { useEffect, useRef } from "react";
import { Appearance, AppState, TouchableOpacity } from "react-native";
import { SystemBars } from "react-native-edge-to-edge";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { I18nextProvider, useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { getLocales } from "expo-localization";
import "react-native-reanimated";
import { Toaster } from "sonner-native";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function useNotificationObserver() {
  useEffect(() => {
    let isMounted = true;

    function redirect(notification: Notifications.Notification) {
      const url = notification.request.content.data?.url;
      if (url) {
        router.push(url);
      }
    }

    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!isMounted || !response?.notification) {
        return;
      }
      redirect(response?.notification);
    });

    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        redirect(response.notification);
      }
    );

    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, []);
}

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
      const tasks = await checkForExistingDownloads();

      if (tasks.find((task) => task.id === job.id)) {
        console.log("TaskManager ~ Download already in progress: ", job.id);
        continue;
      }

      download({
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
          completeHandler(job.id);
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
        .error((error) => {
          console.log("TaskManager ~ Download error: ", job.id, error);
          completeHandler(job.id);
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
  const [loaded] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  Appearance.setColorScheme("dark");

  if (!loaded) {
    return null;
  }

  return (
    <JotaiProvider>
      <SplashScreenProvider>
        <I18nextProvider i18n={i18n}>
          <Layout />
        </I18nextProvider>
      </SplashScreenProvider>
    </JotaiProvider>
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
  const [settings, updateSettings] = useSettings();
  const [orientation, setOrientation] = useAtom(orientationAtom);

  useKeepAwake();
  useNotificationObserver();

  const { i18n } = useTranslation();

  useEffect(() => {
    checkAndRequestPermissions();
  }, []);

  useEffect(() => {
    if (settings?.autoRotate === true)
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.DEFAULT);
    else
      ScreenOrientation.lockAsync(
        ScreenOrientation.OrientationLock.PORTRAIT_UP
      );
  }, [settings]);

  useEffect(() => {
    i18n.changeLanguage(
      settings?.preferedLanguage ?? getLocales()[0].languageCode ?? "en"
    );
  }, [settings?.preferedLanguage, i18n]);

  const appState = useRef(AppState.currentState);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === "active"
      ) {
        checkForExistingDownloads();
      }
    });

    checkForExistingDownloads();

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    const subscription = ScreenOrientation.addOrientationChangeListener(
      (event) => {
        setOrientation(event.orientationInfo.orientation);
      }
    );

    ScreenOrientation.getOrientationAsync().then((initialOrientation) => {
      setOrientation(initialOrientation);
    });

    return () => {
      ScreenOrientation.removeOrientationChangeListener(subscription);
    };
  }, []);

  const url = Linking.useURL();

  if (url) {
    const { hostname, path, queryParams } = Linking.parse(url);
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <ActionSheetProvider>
          <JobQueueProvider>
            <JellyfinProvider>
              <PlaySettingsProvider>
                <LogProvider>
                  <WebSocketProvider>
                    <DownloadProvider>
                      <BottomSheetModalProvider>
                        <SystemBars style="light" hidden={false} />
                        <ThemeProvider value={DarkTheme}>
                          <Stack initialRouteName="/home">
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
                    </DownloadProvider>
                  </WebSocketProvider>
                </LogProvider>
              </PlaySettingsProvider>
            </JellyfinProvider>
          </JobQueueProvider>
        </ActionSheetProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
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
