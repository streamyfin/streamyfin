import "@/augmentations";
import i18n from "@/i18n";
import * as ScreenOrientation from "@/packages/expo-screen-orientation";
import { JellyfinProvider } from "@/providers/JellyfinProvider";
import { NativeDownloadProvider } from "@/providers/NativeDownloadProvider";
import { PlaySettingsProvider } from "@/providers/PlaySettingsProvider";
import {
  SplashScreenProvider,
  useSplashScreenLoading,
} from "@/providers/SplashScreenProvider";
import { WebSocketProvider } from "@/providers/WebSocketProvider";
import { useSettings } from "@/utils/atoms/settings";
import { LogProvider, writeToLog } from "@/utils/log";
import { storage } from "@/utils/mmkv";
import { ActionSheetProvider } from "@expo/react-native-action-sheet";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { DarkTheme, ThemeProvider } from "@react-navigation/native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { useKeepAwake } from "expo-keep-awake";
import { getLocales } from "expo-localization";
import { router, Stack } from "expo-router";
import { Provider as JotaiProvider } from "jotai";
import { useEffect, useRef } from "react";
import { I18nextProvider, useTranslation } from "react-i18next";
import { Appearance, AppState, Platform } from "react-native";
import { SystemBars } from "react-native-edge-to-edge";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";
import { Toaster } from "sonner-native";
const BackGroundDownloader = !Platform.isTV
  ? require("@kesha-antonov/react-native-background-downloader")
  : null;
const Notifications = !Platform.isTV ? require("expo-notifications") : null;

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
      <JellyfinProvider>
        <PlaySettingsProvider>
          <LogProvider>
            <WebSocketProvider>
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
            </WebSocketProvider>
          </LogProvider>
        </PlaySettingsProvider>
      </JellyfinProvider>
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
