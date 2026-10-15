import { Platform } from "react-native";

/**
 * The plugin route a device's push registration is posted to, and deleted from
 * on sign out with the device id after it.
 */
export const PUSH_DEVICE_PATH = "/Streamyfin/device";

/** The plugin route a person reads and replaces their notification choices at. */
export const MY_NOTIFICATIONS_PATH = "/Streamyfin/v1/notifications/mine";

/** The plugin route of the titles a person waits for, to be told when they arrive. */
export const MY_AWAITED_TITLES_PATH = `${MY_NOTIFICATIONS_PATH}/awaited`;

/** The event that tells a person a title they wait for has arrived. */
export const AWAITED_TITLE_EVENT = "awaitedTitle";

/** The query name every reader of the person's notification choices shares. */
export const MY_NOTIFICATIONS_QUERY = "myNotifications";

/** The app's Notifications screen, which Settings and the iOS Settings link open. */
export const NOTIFICATIONS_SETTINGS_ROUTE = "/settings/notifications/page";

/** Set once the app asked for notifications, so it asks once per install. */
export const PERMISSION_ASKED_KEY = "hasAskedForNotificationPermission";

/**
 * What the app asks iOS for. The last one puts a link to the app's Notifications screen in the
 * iOS Settings, under the app's notifications.
 */
export const NOTIFICATION_PERMISSIONS = {
  ios: {
    allowAlert: true,
    allowBadge: true,
    allowSound: true,
    provideAppNotificationSettings: true,
  },
};

/** Set once iOS was asked for that link, so it is asked once per install. */
export const SETTINGS_LINK_ASKED_KEY = "hasAskedForNotificationSettingsLink";

/** The lengths of a pause the app offers, in hours; null is until turned back on. */
export const PAUSE_HOURS = [1, 8, 24, null] as const;

/** The pause a notification's button asks for, in hours. */
export const ACTION_PAUSE_HOURS = 8;

/**
 * What this build can show, sent with the push registration so the plugin only adds a
 * channel or buttons to messages for devices that display them. A message to an Android
 * channel the device never created is not shown at all. Bump a number when the set changes.
 */
export const NOTIFICATION_CAPABILITIES = {
  channels: Platform.OS === "android" ? 1 : 0,
  categories: 1,
} as const;

/** The families the plugin sends, each an Android channel of the same id. */
export const NOTIFICATION_FAMILIES = {
  newContent: "new-content",
  requests: "requests",
  account: "account",
  serverAlerts: "server-alerts",
} as const;

/** A Jellyfin item id, with or without dashes: the only show id a button acts on. */
export const ITEM_ID =
  /^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/** The buttons a notification can carry, by the identifier the app is told back. */
export const NOTIFICATION_ACTIONS = {
  pause: "pause",
  muteShow: "muteShow",
} as const;

/**
 * The buttons of each category the plugin names: an episode can also turn its show off.
 * Category ids have neither `:` nor `-`, as expo-notifications asks.
 */
export const NOTIFICATION_CATEGORIES = {
  episode: [NOTIFICATION_ACTIONS.pause, NOTIFICATION_ACTIONS.muteShow],
  general: [NOTIFICATION_ACTIONS.pause],
} as const;

/** The Android screen with an app's notification settings and its channels. */
export const ANDROID_NOTIFICATION_SETTINGS = {
  action: "android.settings.APP_NOTIFICATION_SETTINGS",
  packageExtra: "android.provider.extra.APP_PACKAGE",
} as const;

/**
 * How long a write of this device's registration may take before it is given up.
 * The writes run one after the other, so one the server never answers would hold
 * back every one after it.
 */
export const PUSH_REGISTRATION_TIMEOUT_MS = 15_000;

/**
 * How many times a read of the person's notification choices or awaited titles is tried
 * again after it fails, online and not for a missing route.
 */
export const PLUGIN_READ_RETRIES = 2;

/**
 * The most titles a person can wait for, and the longest title the plugin keeps, as the
 * plugin sets them (`AwaitedTitles.MostAwaited` and `LongestTitle`). A 400 for one more
 * title than the most means the list is full; any other 400 is a title it cannot keep.
 */
export const MOST_AWAITED_TITLES = 1000;
export const LONGEST_AWAITED_TITLE = 300;
