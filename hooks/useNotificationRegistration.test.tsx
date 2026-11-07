import { act, renderHook } from "@testing-library/react-native";
import { createStore, Provider as JotaiProvider } from "jotai";
import type { ReactNode } from "react";
import { Platform } from "react-native";
import {
  registerBackgroundFetchAsyncSessions,
  unregisterBackgroundFetchAsyncSessions,
} from "@/utils/background-tasks";
import { offerSettingsLinkOnce } from "@/utils/notificationPermissions";
import { useNotificationRegistration } from "./useNotificationRegistration";

jest.mock("@/providers/JellyfinProvider", () =>
  jest.requireActual("@/test-utils/jellyfinProviderModule"),
);

const mockPush = jest.fn();
const mockNotifications = {
  DEFAULT_ACTION_IDENTIFIER: "expo.modules.notifications.actions.DEFAULT",
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  addNotificationReceivedListener: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(),
  addPushTokenListener: jest.fn(),
  AndroidImportance: { DEFAULT: 3 },
};

jest.mock("expo-notifications", () => mockNotifications);
jest.mock("expo-device", () => ({ isDevice: true }));
jest.mock("@/hooks/useAppRouter", () => ({
  __esModule: true,
  default: () => ({ push: mockPush }),
}));
jest.mock("@/utils/background-tasks", () => ({
  registerBackgroundFetchAsyncSessions: jest.fn(async () => {}),
  unregisterBackgroundFetchAsyncSessions: jest.fn(async () => {}),
}));
jest.mock("@/utils/notificationPermissions", () => ({
  offerSettingsLinkOnce: jest.fn(async () => {}),
}));
jest.mock("@/utils/log", () => ({
  writeToLog: jest.fn(),
  writeInfoLog: jest.fn(),
  writeErrorLog: jest.fn(),
}));
jest.mock("@/utils/mmkv", () => ({
  storage: { getString: () => "true", set: jest.fn() },
}));

// Imported after the mocks so the atom is the stub above.
const { userAtom } = jest.requireMock("@/providers/JellyfinProvider");

let store: ReturnType<typeof createStore>;

const wrapper = ({ children }: { children: ReactNode }) => (
  <JotaiProvider store={store}>{children}</JotaiProvider>
);

const signIn = async (user: object | null) => {
  await act(async () => {
    store.set(userAtom, user);
  });
};

/** Lets the registration started by the last change run to its end. */
const settle = async () => {
  await act(async () => {});
};

const setTV = (isTV: boolean) =>
  Object.defineProperty(Platform, "isTV", { value: isTV, configurable: true });

beforeEach(() => {
  jest.clearAllMocks();
  store = createStore();
  setTV(false);
  Object.defineProperty(Platform, "OS", { value: "ios", configurable: true });
  jest.spyOn(console, "log").mockImplementation(() => {});
  mockNotifications.getPermissionsAsync.mockResolvedValue({
    status: "granted",
  });
  mockNotifications.getExpoPushTokenAsync.mockResolvedValue({ data: "tok" });
  mockNotifications.addNotificationReceivedListener.mockReturnValue({
    remove: jest.fn(),
  });
  mockNotifications.addNotificationResponseReceivedListener.mockReturnValue({
    remove: jest.fn(),
  });
  mockNotifications.addPushTokenListener.mockReturnValue({
    remove: jest.fn(),
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

const admin = (Id: string) => ({ Id, Policy: { IsAdministrator: true } });

test("listens and registers once on mount", async () => {
  await renderHook(() => useNotificationRegistration(), { wrapper });
  await settle();

  expect(
    mockNotifications.addNotificationReceivedListener,
  ).toHaveBeenCalledTimes(1);
  expect(
    mockNotifications.addNotificationResponseReceivedListener,
  ).toHaveBeenCalledTimes(1);
  expect(mockNotifications.getPermissionsAsync).toHaveBeenCalledTimes(1);
  expect(mockNotifications.getExpoPushTokenAsync).toHaveBeenCalledTimes(1);
});

test("a new user object with the same Id re-runs nothing", async () => {
  await signIn({ Id: "u1" });
  const { result } = await renderHook(() => useNotificationRegistration(), {
    wrapper,
  });
  await settle();
  expect(result.current?.data).toBe("tok");

  await signIn({ Id: "u1", Name: "refreshed" });
  await settle();

  expect(mockNotifications.getPermissionsAsync).toHaveBeenCalledTimes(1);
  expect(offerSettingsLinkOnce).toHaveBeenCalledTimes(1);
  expect(mockNotifications.getExpoPushTokenAsync).toHaveBeenCalledTimes(1);
  expect(
    mockNotifications.addNotificationReceivedListener,
  ).toHaveBeenCalledTimes(1);
  expect(
    mockNotifications.addNotificationResponseReceivedListener,
  ).toHaveBeenCalledTimes(1);
});

test("a new Id re-runs the registration but not the token fetch", async () => {
  await signIn({ Id: "u1" });
  await renderHook(() => useNotificationRegistration(), { wrapper });
  await settle();

  await signIn({ Id: "u2" });
  await settle();

  expect(mockNotifications.getPermissionsAsync).toHaveBeenCalledTimes(2);
  expect(mockNotifications.getExpoPushTokenAsync).toHaveBeenCalledTimes(1);
  expect(
    mockNotifications.addNotificationReceivedListener,
  ).toHaveBeenCalledTimes(1);
});

test("the admin flag flipping re-runs the registration", async () => {
  await signIn({ Id: "u1" });
  await renderHook(() => useNotificationRegistration(), { wrapper });
  await settle();
  expect(registerBackgroundFetchAsyncSessions).not.toHaveBeenCalled();

  await signIn(admin("u1"));
  await settle();

  expect(mockNotifications.getPermissionsAsync).toHaveBeenCalledTimes(2);
  expect(registerBackgroundFetchAsyncSessions).toHaveBeenCalledTimes(1);
});

test("a failed token fetch is tried again on the next run", async () => {
  jest.spyOn(console, "error").mockImplementation(() => {});
  mockNotifications.getExpoPushTokenAsync.mockRejectedValueOnce(
    new Error("no network"),
  );
  await signIn({ Id: "u1" });
  const { result } = await renderHook(() => useNotificationRegistration(), {
    wrapper,
  });
  await settle();
  expect(result.current).toBeUndefined();

  await signIn({ Id: "u2" });
  await settle();

  expect(mockNotifications.getExpoPushTokenAsync).toHaveBeenCalledTimes(2);
  expect(result.current?.data).toBe("tok");
});

test("the token fetch is not started twice while one is in flight", async () => {
  let resolve: (token: { data: string }) => void = () => {};
  mockNotifications.getExpoPushTokenAsync.mockReturnValueOnce(
    new Promise((r) => {
      resolve = r;
    }),
  );
  await signIn({ Id: "u1" });
  await renderHook(() => useNotificationRegistration(), { wrapper });
  await settle();

  await signIn({ Id: "u2" });
  await settle();
  expect(mockNotifications.getExpoPushTokenAsync).toHaveBeenCalledTimes(1);

  await act(async () => resolve({ data: "tok" }));
});

test("a tapped notification opens its route through the latest router", async () => {
  await renderHook(() => useNotificationRegistration(), { wrapper });
  await act(async () => {});
  const onResponse =
    mockNotifications.addNotificationResponseReceivedListener.mock.calls[0][0];

  onResponse({
    actionIdentifier: mockNotifications.DEFAULT_ACTION_IDENTIFIER,
    notification: {
      request: { content: { title: "t", data: { url: "/items/page?id=1" } } },
    },
  });

  expect(mockPush).toHaveBeenCalledTimes(1);
});

test("a non-admin account unregisters the sessions task", async () => {
  await signIn(admin("u1"));
  await renderHook(() => useNotificationRegistration(), { wrapper });
  await settle();
  expect(registerBackgroundFetchAsyncSessions).toHaveBeenCalledTimes(1);

  await signIn({ Id: "u2" });
  await settle();

  expect(unregisterBackgroundFetchAsyncSessions).toHaveBeenCalledTimes(1);
});

test("a rolled device token refreshes the expo token", async () => {
  mockNotifications.getExpoPushTokenAsync
    .mockResolvedValueOnce({ data: "tok" })
    .mockResolvedValueOnce({ data: "tok2" });
  const { result } = await renderHook(() => useNotificationRegistration(), {
    wrapper,
  });
  await settle();
  expect(result.current?.data).toBe("tok");

  const listener = mockNotifications.addPushTokenListener.mock.calls[0][0];
  await act(async () => {
    listener({ type: "ios", data: "device-token-2" });
    await Promise.resolve();
  });
  await settle();

  expect(mockNotifications.getExpoPushTokenAsync).toHaveBeenLastCalledWith(
    expect.objectContaining({
      devicePushToken: { type: "ios", data: "device-token-2" },
    }),
  );
  expect(result.current?.data).toBe("tok2");
});

// The native side resolves the app's own device token request and then emits
// the same token as an event, on iOS and on Android.
test("the token the app asked for is not fetched a second time", async () => {
  let resolveToken: (token: { data: string }) => void = () => {};
  mockNotifications.getExpoPushTokenAsync.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveToken = resolve;
      }),
  );
  const { result } = await renderHook(() => useNotificationRegistration(), {
    wrapper,
  });
  await settle();

  const listener = mockNotifications.addPushTokenListener.mock.calls[0][0];
  await act(async () => {
    listener({ type: "ios", data: "device-token" });
    resolveToken({ data: "tok" });
  });
  await settle();

  expect(mockNotifications.getExpoPushTokenAsync).toHaveBeenCalledTimes(1);
  expect(result.current?.data).toBe("tok");
});

// Android hands a new FCM token to the listener whatever the permission
// says, and an emulator has one too.
test("a device token arriving before any expo token fetches nothing", async () => {
  mockNotifications.getPermissionsAsync.mockResolvedValue({ status: "denied" });
  const { result } = await renderHook(() => useNotificationRegistration(), {
    wrapper,
  });
  await settle();

  const listener = mockNotifications.addPushTokenListener.mock.calls[0][0];
  await act(async () => {
    listener({ type: "android", data: "fcm-token" });
  });
  await settle();

  expect(mockNotifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
  expect(result.current).toBeUndefined();
});

// A revoked permission must not keep the task polling sessions under the
// account that signed in after an admin.
test("a non-admin account unregisters the sessions task without notifications", async () => {
  mockNotifications.getPermissionsAsync.mockResolvedValue({ status: "denied" });
  await signIn({ Id: "u1" });
  await renderHook(() => useNotificationRegistration(), { wrapper });
  await settle();

  expect(unregisterBackgroundFetchAsyncSessions).toHaveBeenCalled();
  expect(registerBackgroundFetchAsyncSessions).not.toHaveBeenCalled();
});

// The task only sets the app badge, which shows nothing without the
// permission, and it would keep polling sessions in the background.
test("an admin without notifications unregisters the sessions task", async () => {
  mockNotifications.getPermissionsAsync.mockResolvedValue({ status: "denied" });
  await signIn(admin("a1"));
  await renderHook(() => useNotificationRegistration(), { wrapper });
  await settle();

  expect(unregisterBackgroundFetchAsyncSessions).toHaveBeenCalled();
  expect(registerBackgroundFetchAsyncSessions).not.toHaveBeenCalled();
});

test("does nothing on TV", async () => {
  setTV(true);
  await signIn({ Id: "u1" });
  const { result } = await renderHook(() => useNotificationRegistration(), {
    wrapper,
  });
  await settle();

  expect(result.current).toBeUndefined();
  expect(
    mockNotifications.addNotificationReceivedListener,
  ).not.toHaveBeenCalled();
  expect(
    mockNotifications.addNotificationResponseReceivedListener,
  ).not.toHaveBeenCalled();
  expect(mockNotifications.getPermissionsAsync).not.toHaveBeenCalled();
});
