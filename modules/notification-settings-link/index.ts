import type { EventSubscription } from "expo-modules-core";
import { Platform, requireNativeModule } from "expo-modules-core";

type NotificationSettingsLinkNativeModule = {
  takePendingSettingsOpen(): boolean;
  addListener(event: "onOpenSettings", listener: () => void): EventSubscription;
};

// iOS only, and wrapped so a build without the module simply has no link.
const SettingsLink: NotificationSettingsLinkNativeModule | null = (() => {
  if (Platform.OS !== "ios") return null;
  try {
    return requireNativeModule<NotificationSettingsLinkNativeModule>(
      "NotificationSettingsLink",
    );
  } catch {
    return null;
  }
})();

/** Whether the app was opened by the link in the iOS Settings, forgotten once read. */
export const takePendingSettingsOpen = (): boolean =>
  SettingsLink?.takePendingSettingsOpen() ?? false;

/** Called whenever the link in the iOS Settings is tapped while the app runs. */
export const addSettingsOpenListener = (
  listener: () => void,
): EventSubscription | null =>
  SettingsLink?.addListener("onOpenSettings", listener) ?? null;
