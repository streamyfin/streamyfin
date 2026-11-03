import * as Device from "expo-device";
import type { EventSubscription } from "expo-modules-core";
import type {
  Notification,
  NotificationResponse,
} from "expo-notifications/build/Notifications.types";
import type {
  DevicePushToken,
  ExpoPushToken,
} from "expo-notifications/build/Tokens.types";
import { useAtomValue } from "jotai";
import { useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import {
  EXPO_PROJECT_ID,
  NOTIFICATION_PERMISSIONS,
  PERMISSION_ASKED_KEY,
} from "@/constants/Notifications";
import useRouter from "@/hooks/useAppRouter";
import { userAtom } from "@/providers/JellyfinProvider";
import {
  registerBackgroundFetchAsyncSessions,
  unregisterBackgroundFetchAsyncSessions,
} from "@/utils/background-tasks";
import { writeErrorLog, writeInfoLog, writeToLog } from "@/utils/log";
import { storage } from "@/utils/mmkv";
import { offerSettingsLinkOnce } from "@/utils/notificationPermissions";
import { isPlainTap, notificationRoute } from "@/utils/notificationRoute";

/**
 * Asks for notifications once per install, and says whether they are allowed.
 */
const checkAndRequestPermissions = async (Notifications: any) => {
  try {
    const hasAskedBefore = storage.getString(PERMISSION_ASKED_KEY);
    let granted = false;
    if (hasAskedBefore !== "true") {
      const { status } = await Notifications.requestPermissionsAsync(
        NOTIFICATION_PERMISSIONS,
      );
      granted = status === "granted";
      if (granted) {
        writeToLog("INFO", "Notification permissions granted.");
        console.log("Notification permissions granted.");
      } else {
        writeToLog("ERROR", "Notification permissions denied.");
        console.log("Notification permissions denied.");
      }
      storage.set(PERMISSION_ASKED_KEY, "true");
    } else {
      // Already asked before, check current status
      const { status } = await Notifications.getPermissionsAsync();
      granted = status === "granted";
      if (granted && Platform.OS === "ios") {
        await offerSettingsLinkOnce(Notifications, storage);
      }
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

/**
 * Listens for notifications from mount on, and registers this device for them.
 * Returns the Expo push token once it is known.
 *
 * The listeners are registered once on mount and never re-added: a response
 * must never be missed. The registration runs in the effect, not after the
 * first paint: React Native's `InteractionManager` runs its task through
 * `setImmediate`, which is a microtask, so deferring through it changes
 * nothing. It re-runs for a different user or a changed admin flag only, not
 * for each new `user` object: `userAtom` takes a new object with the same Id
 * twice per launch. The push token is fetched once per mount of the hook, not
 * per process. A failed fetch is retried only when the user or the admin flag
 * changes.
 */
export const useNotificationRegistration = (): ExpoPushToken | undefined => {
  const user = useAtomValue(userAtom);
  const userId = user?.Id;
  const isAdministrator = !!user?.Policy?.IsAdministrator;

  const router = useRouter();
  // The response listener outlives any one router.
  const latestRouter = useRef(router);
  latestRouter.current = router;

  const [expoPushToken, setExpoPushToken] = useState<ExpoPushToken>();
  const tokenFetch = useRef<"idle" | "pending" | "done">("idle");
  // A newer registration run supersedes one still awaiting: only the latest
  // may register or unregister the sessions task.
  const registrationRunRef = useRef(0);

  useEffect(() => {
    if (Platform.isTV) return;
    const Notifications = require("expo-notifications");

    const received: EventSubscription =
      Notifications.addNotificationReceivedListener(
        (notification: Notification) => {
          // Log only the title — serializing the whole notification touches
          // the deprecated dataString getter (deprecation warning) and dumps
          // noisy payloads into the console.
          console.log(
            "Notification received while app running:",
            notification.request.content.title,
          );
        },
      );

    const response: EventSubscription =
      Notifications.addNotificationResponseReceivedListener(
        (response: NotificationResponse) => {
          // A button is carried out by useNotificationActions, and opens nothing.
          if (!isPlainTap(response, Notifications.DEFAULT_ACTION_IDENTIFIER)) {
            return;
          }
          // Currently the notifications supported by the plugin will send data for deep links.
          const { title, data } = response.notification.request.content;
          writeInfoLog(`Notification ${title} opened`, data);

          const url = notificationRoute(data);

          writeInfoLog(`Notification attempting to redirect to ${url}`);
          if (url) {
            latestRouter.current.push(url as never);
          }
        },
      );

    // The device push token can roll while the app runs, and the Expo token
    // built from the old one stops delivering.
    const pushToken: EventSubscription = Notifications.addPushTokenListener(
      (devicePushToken: DevicePushToken) => {
        Notifications.getExpoPushTokenAsync({
          projectId: EXPO_PROJECT_ID,
          devicePushToken,
        })
          .then((token: ExpoPushToken) => {
            tokenFetch.current = "done";
            setExpoPushToken(token);
          })
          .catch((reason: any) => {
            writeErrorLog("Failed to refresh Expo push token", reason);
          });
      },
    );

    return () => {
      received?.remove();
      response?.remove();
      pushToken?.remove();
    };
  }, []);

  useEffect(() => {
    if (Platform.isTV) return;
    const Notifications = require("expo-notifications");

    const registerNotifications = async () => {
      const run = ++registrationRunRef.current;
      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("default", {
          name: "default",
        });

        // Create dedicated channel for download notifications
        await Notifications.setNotificationChannelAsync("downloads", {
          name: "Downloads",
          importance: Notifications.AndroidImportance.DEFAULT,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: "#FF231F7C",
        });
      }

      const granted = await checkAndRequestPermissions(Notifications);
      if (!granted) {
        console.log(
          "Notification permissions not granted, skipping background fetch and push token registration.",
        );
        return;
      }
      // A newer run started while the permission check was out: it owns
      // whatever comes next.
      if (run !== registrationRunRef.current) return;

      if (isAdministrator) {
        await registerBackgroundFetchAsyncSessions();
      } else {
        // The task survives an admin signing out or switching to a non-admin
        // account, and would keep polling sessions under the wrong one.
        if (!(await unregisterBackgroundFetchAsyncSessions())) {
          console.warn("Failed to unregister the sessions background task");
        }
      }

      // only create push token for real devices (pointless for emulators)
      if (Device.isDevice && tokenFetch.current === "idle") {
        tokenFetch.current = "pending";
        Notifications.getExpoPushTokenAsync({
          projectId: EXPO_PROJECT_ID,
        })
          .then((token: ExpoPushToken) => {
            // The roll listener may already have refreshed it: that token is
            // newer than the one this fetch was started with.
            if (tokenFetch.current === "done") return;
            if (token) {
              console.log("Expo push token obtained:", token.data);
              tokenFetch.current = "done";
              setExpoPushToken(token);
            } else {
              tokenFetch.current = "idle";
            }
          })
          .catch((reason: any) => {
            tokenFetch.current = "idle";
            console.error("Failed to get push token:", reason);
            writeErrorLog("Failed to get Expo push token", reason);
          });
      }
    };

    void registerNotifications();
  }, [userId, isAdministrator]);

  return expoPushToken;
};
