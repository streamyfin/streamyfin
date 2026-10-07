import { QueryClient } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
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
  return { apiAtom: atom({ basePath: "https://jellyfin.example.com" }) };
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

describe("the buttons on a notification", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLast = null;
    mockListener = null;
    mockHandle.mockResolvedValue("paused");
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

  test("carry out one pressed while the app runs, and read the choices again", async () => {
    const invalidate = jest.spyOn(client, "invalidateQueries");
    mockHandle.mockResolvedValue("muted");
    await renderHook(() => useNotificationActions(client));

    await act(async () => {
      mockListener?.(response("muteShow"));
    });

    await waitFor(() =>
      expect(mockSuccess).toHaveBeenCalledWith(
        "home.settings.notifications.actions.muted",
      ),
    );
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["myNotifications"],
    });
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
