import type { Api } from "@jellyfin/sdk";
import {
  ACTION_PAUSE_HOURS,
  ITEM_ID,
  NOTIFICATION_ACTIONS,
  NOTIFICATION_CATEGORIES,
} from "@/constants/Notifications";
import { muteShow, pauseNotifications } from "./notificationPreferences";

const TITLES: Record<string, string> = {
  [NOTIFICATION_ACTIONS.pause]: "home.settings.notifications.actions.pause",
  [NOTIFICATION_ACTIONS.muteShow]:
    "home.settings.notifications.actions.mute_show",
};

type CategoryApi = {
  setNotificationCategoryAsync: (
    id: string,
    actions: {
      identifier: string;
      buttonTitle: string;
      options: { opensAppToForeground: boolean };
    }[],
  ) => Promise<unknown> | unknown;
};

/** Declares the buttons of each category, or renames them in the app's language. */
export const registerNotificationCategories = async (
  notifications: CategoryApi,
  t: (key: string) => string,
): Promise<void> => {
  // One after the other: on iOS each call reads the categories and writes them back, and two
  // at once on a first start can both read none and keep only one.
  for (const [category, actions] of Object.entries(NOTIFICATION_CATEGORIES)) {
    await notifications.setNotificationCategoryAsync(
      category,
      actions.map((action) => ({
        identifier: action,
        buttonTitle: t(TITLES[action]),
        // A button that leaves the app closed is never heard on iOS once the app was
        // killed, so each one opens it to be carried out.
        options: { opensAppToForeground: true },
      })),
    );
  }
};

type ActionResponse = {
  actionIdentifier: string;
  notification: { request: { content: { data?: Record<string, unknown> } } };
};

/** Carries out a notification button, and says which one it was, or null for none. */
export const handleNotificationAction = async (
  response: ActionResponse,
  api: Api,
): Promise<"paused" | "muted" | null> => {
  switch (response.actionIdentifier) {
    case NOTIFICATION_ACTIONS.pause:
      await pauseNotifications(api, ACTION_PAUSE_HOURS);
      return "paused";
    case NOTIFICATION_ACTIONS.muteShow: {
      // Anyone with the device's push token can send a notification, so its data is only
      // used when it is what the plugin puts there.
      const seriesId = response.notification.request.content.data?.seriesId;
      if (typeof seriesId !== "string" || !ITEM_ID.test(seriesId)) return null;
      await muteShow(api, seriesId);
      return "muted";
    }
    default:
      return null;
  }
};
