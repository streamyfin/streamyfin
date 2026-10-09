import {
  NOTIFICATION_PERMISSIONS,
  SETTINGS_LINK_ASKED_KEY,
} from "@/constants/Notifications";

type PermissionApi = {
  requestPermissionsAsync: (
    permissions: typeof NOTIFICATION_PERMISSIONS,
  ) => Promise<unknown>;
};

type Store = {
  getString: (key: string) => string | undefined;
  set: (key: string, value: string) => void;
};

/**
 * Asks iOS again, which shows nothing once answered, so the link in the iOS Settings also
 * appears for people who said yes before the app offered it. Once per install: iOS keeps it.
 */
export const offerSettingsLinkOnce = async (
  notifications: PermissionApi,
  store: Store,
): Promise<void> => {
  if (store.getString(SETTINGS_LINK_ASKED_KEY) === "true") return;
  await notifications.requestPermissionsAsync(NOTIFICATION_PERMISSIONS);
  store.set(SETTINGS_LINK_ASKED_KEY, "true");
};
