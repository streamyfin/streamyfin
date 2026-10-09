import { NOTIFICATION_FAMILIES } from "@/constants/Notifications";

/**
 * The Android channels, one per family the plugin sends. The person can tune each in the
 * system settings; once created, only they can change how loud it is.
 */
export const NOTIFICATION_CHANNELS = [
  {
    id: NOTIFICATION_FAMILIES.newContent,
    nameKey: "home.settings.notifications.channels.new_content",
    important: false,
  },
  {
    id: NOTIFICATION_FAMILIES.requests,
    nameKey: "home.settings.notifications.channels.requests",
    important: false,
  },
  {
    id: NOTIFICATION_FAMILIES.account,
    nameKey: "home.settings.notifications.channels.account",
    important: true,
  },
  {
    id: NOTIFICATION_FAMILIES.serverAlerts,
    nameKey: "home.settings.notifications.channels.server_alerts",
    important: true,
  },
] as const;

type ChannelApi = {
  setNotificationChannelAsync: (
    id: string,
    channel: { name: string; importance: number },
  ) => Promise<unknown> | unknown;
  AndroidImportance: { DEFAULT: number; HIGH: number };
};

/** Creates the channels, or renames them in the app's language when they exist. */
export const createNotificationChannels = async (
  notifications: ChannelApi,
  t: (key: string) => string,
): Promise<void> => {
  for (const channel of NOTIFICATION_CHANNELS) {
    await notifications.setNotificationChannelAsync(channel.id, {
      name: t(channel.nameKey),
      importance: channel.important
        ? notifications.AndroidImportance.HIGH
        : notifications.AndroidImportance.DEFAULT,
    });
  }
};
