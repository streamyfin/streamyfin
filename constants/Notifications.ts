/**
 * The plugin route a device's push registration is posted to, and deleted from
 * on sign out with the device id after it.
 */
export const PUSH_DEVICE_PATH = "/Streamyfin/device";

/** The plugin route a person reads and replaces their notification choices at. */
export const MY_NOTIFICATIONS_PATH = "/Streamyfin/v1/notifications/mine";

/** The lengths of a pause the app offers, in hours; null is until turned back on. */
export const PAUSE_HOURS = [1, 8, 24, null] as const;

/** The pause a notification's button asks for, in hours. */
export const ACTION_PAUSE_HOURS = 8;
