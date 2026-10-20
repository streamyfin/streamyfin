import { QueryClient } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import {
  type MyNotifications,
  myNotificationsKey,
} from "@/utils/notificationPreferences";
import { useNotificationActions } from "./useNotificationActions";

const DEFAULT = "expo.modules.notifications.actions.DEFAULT";
let mockLast: unknown = null;
let mockListener: ((response: unknown) => void) | null = null;
const mockClear = jest.fn(() => {
  mockLast = null;
});
const mockHandle = jest.fn();
const mockSuccess = jest.fn();
const mockError = jest.fn();

jest.mock("expo-notifications", () => ({
  DEFAULT_ACTION_IDENTIFIER: "expo.modules.notifications.actions.DEFAULT",
  getLastNotificationResponse: () => mockLast,
  clearLastNotificationResponse: () => mockClear(),
  addNotificationResponseReceivedListener: (
    listener: (response: unknown) => void,
  ) => {
    mockListener = listener;
    return { remove: jest.fn() };
  },
}));
jest.mock("@/utils/notificationActions", () => ({
  handleNotificationAction: (...args: unknown[]) => mockHandle(...args),
}));
jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return {
    apiAtom: atom({ basePath: "https://jellyfin.example.com" }),
    userAtom: atom({ Id: "alice" }),
  };
});
jest.mock("sonner-native", () => ({
  toast: {
    success: (...args: unknown[]) => mockSuccess(...args),
    error: (...args: unknown[]) => mockError(...args),
  },
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const response = (actionIdentifier: string) => ({
  actionIdentifier,
  notification: { request: { content: { data: { seriesId: "bear" } } } },
});

const client = new QueryClient({
  defaultOptions: {
    queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
  },
});

const key = myNotificationsKey("https://jellyfin.example.com", "alice");
const shown: MyNotifications = {
  pause: null,
  events: [{ key: "itemAdded", family: "new-content", enabled: true }],
  libraries: [],
  follow: { favorites: true, started: true },
  mutedShows: [],
};
// What the server answers: the show turned off, and a switch it had not heard of yet.
const answer = (mine: Partial<MyNotifications>) => ({
  ...shown,
  events: [{ key: "itemAdded", family: "new-content", enabled: false }],
  ...mine,
});

describe("the buttons on a notification", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLast = null;
    mockListener = null;
    client.clear();
    mockHandle.mockResolvedValue({ done: "paused", mine: answer({}) });
  });

  test("carry out the one that opened the app, once", async () => {
    mockLast = response("pause");

    const { rerender } = await renderHook(() => useNotificationActions(client));
    await rerender({});

    await waitFor(() =>
      expect(mockSuccess).toHaveBeenCalledWith(
        "home.settings.notifications.actions.paused",
      ),
    );
    expect(mockHandle).toHaveBeenCalledTimes(1);
    expect(mockClear).toHaveBeenCalled();
  });

  // The answer has the pause and the muted shows, which have routes of their own. Read again
  // instead, the screen would ask once more, and a read on its way can undo a switch moved
  // meanwhile, as can the answer's other choices.
  test("carry out one pressed while the app runs, and show what it changed", async () => {
    const invalidate = jest.spyOn(client, "invalidateQueries");
    client.setQueryData(key, shown);
    const muted = [{ id: "bear", name: "Bear" }];
    mockHandle.mockResolvedValue({
      done: "muted",
      mine: answer({ mutedShows: muted }),
    });
    await renderHook(() => useNotificationActions(client));

    await act(async () => {
      mockListener?.(response("muteShow"));
    });

    await waitFor(() =>
      expect(mockSuccess).toHaveBeenCalledWith(
        "home.settings.notifications.actions.muted",
      ),
    );
    expect(client.getQueryData(key)).toEqual({ ...shown, mutedShows: muted });
    expect(invalidate).not.toHaveBeenCalled();
  });

  test("show the pause it asked for", async () => {
    client.setQueryData(key, shown);
    const pause = { until: "2026-10-16T03:00:00Z" };
    mockHandle.mockResolvedValue({ done: "paused", mine: answer({ pause }) });
    await renderHook(() => useNotificationActions(client));

    await act(async () => {
      mockListener?.(response("pause"));
    });

    await waitFor(() =>
      expect(client.getQueryData(key)).toEqual({ ...shown, pause }),
    );
  });

  // Nothing is kept until the Notifications screen first reads it, and a part of the choices
  // is not something to show.
  test("keep nothing when the choices were never read", async () => {
    mockHandle.mockResolvedValue({ done: "paused", mine: answer({}) });
    await renderHook(() => useNotificationActions(client));

    await act(async () => {
      mockListener?.(response("pause"));
    });

    await waitFor(() => expect(mockSuccess).toHaveBeenCalled());
    expect(client.getQueryData(key)).toBeUndefined();
  });

  // A plain tap opens what the notification is about, which is not this hook's to do.
  test("leave a plain tap alone", async () => {
    mockLast = response(DEFAULT);
    await renderHook(() => useNotificationActions(client));

    await act(async () => {
      mockListener?.(response(DEFAULT));
    });

    expect(mockHandle).not.toHaveBeenCalled();
    expect(mockClear).not.toHaveBeenCalled();
  });

  test("say so when the server refuses", async () => {
    mockHandle.mockRejectedValue(new Error("offline"));
    await renderHook(() => useNotificationActions(client));

    await act(async () => {
      mockListener?.(response("pause"));
    });

    await waitFor(() =>
      expect(mockError).toHaveBeenCalledWith(
        "home.settings.notifications.save_failed",
      ),
    );
  });
});
