import * as Application from "expo-application";
import { Linking, Platform } from "react-native";
import { ANDROID_NOTIFICATION_SETTINGS } from "@/constants/Notifications";

/**
 * Opens the phone's settings for this app's notifications: on Android the screen with its
 * channels, falling back to the app's settings; on iOS the app's settings.
 */
export const openNotificationSettings = async (
  os: string = Platform.OS,
): Promise<void> => {
  if (os === "android") {
    try {
      await Linking.sendIntent(ANDROID_NOTIFICATION_SETTINGS.action, [
        {
          key: ANDROID_NOTIFICATION_SETTINGS.packageExtra,
          value: Application.applicationId ?? "",
        },
      ]);
      return;
    } catch {
      // Some builds of Android have no such screen; the app's settings lead to it.
    }
  }
  await Linking.openSettings();
};
