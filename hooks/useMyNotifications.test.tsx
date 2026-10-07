import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type React from "react";
import { useMyNotifications } from "./useMyNotifications";

const mockGet = jest.fn();
const mockPut = jest.fn();
const mockToastError = jest.fn();

jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return {
    apiAtom: atom({
      basePath: "https://jellyfin.example.com",
      get: (...args: unknown[]) => mockGet(...args),
      put: (...args: unknown[]) => mockPut(...args),
    }),
    userAtom: atom({ Id: "alice" }),
  };
});
jest.mock("sonner-native", () => ({
  toast: { error: (...args: unknown[]) => mockToastError(...args) },
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// No garbage collection timer nor retry: either keeps Jest from exiting.
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider
    client={
      new QueryClient({
        defaultOptions: {
          queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
          mutations: { gcTime: Number.POSITIVE_INFINITY, retry: false },
        },
      })
    }
  >
    {children}
  </QueryClientProvider>
);

const mine = {
  pause: null,
  events: [{ key: "itemAdded", family: "new-content", enabled: true }],
  libraries: [],
  follow: { favorites: true, started: true },
  mutedShows: [],
};

describe("the person's notification choices", () => {
  beforeEach(() => jest.clearAllMocks());

  // A plugin without the route hides the screen, silently.
  it("are unsupported when the plugin does not know the route", async () => {
    mockGet.mockRejectedValue({ response: { status: 404 } });

    const { result } = await renderHook(() => useMyNotifications(), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.supported).toBe(false);
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it("are supported once the plugin answers", async () => {
    mockGet.mockResolvedValue({ data: mine });

    const { result } = await renderHook(() => useMyNotifications(), {
      wrapper,
    });

    await waitFor(() => expect(result.current.mine).toEqual(mine));
    expect(result.current.supported).toBe(true);
  });

  // A change the server refuses comes back, and says so.
  it("go back to what they were when a change fails", async () => {
    mockGet.mockResolvedValue({ data: mine });
    mockPut.mockRejectedValue(new Error("offline"));

    const { result } = await renderHook(() => useMyNotifications(), {
      wrapper,
    });
    await waitFor(() => expect(result.current.mine).toBeDefined());

    await act(async () => {
      await result.current.update({
        ...mine,
        events: [{ ...mine.events[0], enabled: false }],
      });
    });

    await waitFor(() =>
      expect(result.current.mine?.events[0].enabled).toBe(true),
    );
    expect(mockToastError).toHaveBeenCalledWith(
      "home.settings.notifications.save_failed",
    );
  });
});
