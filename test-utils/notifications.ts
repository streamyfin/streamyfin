/**
 * `expo-notifications` for every unit spec, wired in `unitSetup.ts`. The real
 * module is native and logs an Expo Go push warning when it loads. Every
 * function is a `jest.fn()` that answers as a phone with nothing scheduled and
 * permission not yet asked. A spec changes an answer with
 * `jest.mocked(getPermissionsAsync).mockResolvedValue(...)`.
 */
const subscription = () => ({ remove: jest.fn() });

export const notificationsModule = {
  AndroidImportance: {
    UNKNOWN: 0,
    UNSPECIFIED: 1,
    NONE: 2,
    MIN: 3,
    LOW: 4,
    DEFAULT: 5,
    HIGH: 6,
    MAX: 7,
  },
  DEFAULT_ACTION_IDENTIFIER: "expo.modules.notifications.actions.DEFAULT",
  getPermissionsAsync: jest.fn(async () => ({ status: "undetermined" })),
  requestPermissionsAsync: jest.fn(async () => ({ status: "undetermined" })),
  getExpoPushTokenAsync: jest.fn(async () => ({ data: "" })),
  getNotificationChannelAsync: jest.fn(async () => null),
  setNotificationChannelAsync: jest.fn(async () => null),
  setNotificationHandler: jest.fn(),
  setBadgeCountAsync: jest.fn(async () => true),
  scheduleNotificationAsync: jest.fn(async () => "notification-1"),
  getLastNotificationResponse: jest.fn(() => null),
  getLastNotificationResponseAsync: jest.fn(async () => null),
  clearLastNotificationResponse: jest.fn(),
  addNotificationReceivedListener: jest.fn(subscription),
  addNotificationResponseReceivedListener: jest.fn(subscription),
  addPushTokenListener: jest.fn(subscription),
};
