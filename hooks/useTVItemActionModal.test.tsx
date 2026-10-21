import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react-native";
import type React from "react";
import { Alert, type AlertButton } from "react-native";
import { useTVItemActionModal } from "./useTVItemActionModal";

const mockMarkPlayed = jest.fn<Promise<void>, [string]>();
const mockMarkUnplayed = jest.fn<Promise<void>, [string]>();
const mockPrune = jest.fn<Promise<void>, [string[]]>();

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock("@/hooks/usePlaybackManager", () => ({
  usePlaybackManager: () => ({
    markItemPlayed: (id: string) => mockMarkPlayed(id),
    markItemUnplayed: (id: string) => mockMarkUnplayed(id),
  }),
}));
jest.mock("@/hooks/useRevalidatePlaybackProgressCache", () => ({
  useInvalidatePlaybackProgressCache: () => async () => {},
}));
jest.mock("@/hooks/useWatchlist", () => ({
  usePruneWatchedFromWatchlist: () => (ids: string[]) => mockPrune(ids),
}));
jest.mock("@/utils/log", () => ({ logAndCaptureError: jest.fn() }));

// An infinite gcTime schedules no cleanup timer that would keep Jest running.
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider
    client={
      new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } })
    }
  >
    {children}
  </QueryClientProvider>
);

/** Opens the long-press menu for `item` and returns its played action. */
const openMenu = async (item: BaseItemDto) => {
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  const { result } = await renderHook(() => useTVItemActionModal(), {
    wrapper,
  });
  await act(async () => result.current.showItemActions(item));
  const buttons = alert.mock.calls[0][2] as AlertButton[];
  return buttons.find((button) => button.style !== "cancel")!;
};

const movie = (played: boolean): BaseItemDto => ({
  Id: "m1",
  Type: "Movie",
  Name: "A movie",
  UserData: { Played: played, Likes: true },
});

beforeEach(() => {
  jest.restoreAllMocks();
  mockMarkPlayed.mockReset().mockResolvedValue();
  mockMarkUnplayed.mockReset().mockResolvedValue();
  mockPrune.mockReset().mockResolvedValue();
});

// Review of #2171: on Android TV and Apple TV the server ended with
// Played=true and Likes=true, and the card stayed in the Watchlists tab.
test("takes an item marked watched from the long-press menu off the watchlist", async () => {
  let markedOnServer: () => void = () => {};
  mockMarkPlayed.mockImplementation(
    () =>
      new Promise((resolve) => {
        markedOnServer = resolve;
      }),
  );
  const markWatched = await openMenu(movie(false));

  let pressed: Promise<void> | undefined;
  await act(async () => {
    pressed = markWatched.onPress?.() as Promise<void> | undefined;
  });
  // The prune reads the item back from the server, so it waits for the mark.
  expect(mockMarkPlayed).toHaveBeenCalledWith("m1");
  expect(mockPrune).not.toHaveBeenCalled();

  await act(async () => {
    markedOnServer();
    await pressed;
  });
  expect(mockPrune).toHaveBeenCalledWith(["m1"]);
});

test("leaves the watchlist alone when the item is marked unwatched", async () => {
  const markUnwatched = await openMenu(movie(true));

  await act(async () => {
    await markUnwatched.onPress?.();
  });

  expect(mockMarkUnplayed).toHaveBeenCalledWith("m1");
  expect(mockPrune).not.toHaveBeenCalled();
});

test("leaves the watchlist alone when marking the item watched fails", async () => {
  mockMarkPlayed.mockRejectedValue(new Error("server said no"));
  const markWatched = await openMenu(movie(false));

  await act(async () => {
    await markWatched.onPress?.();
  });

  expect(mockPrune).not.toHaveBeenCalled();
});
