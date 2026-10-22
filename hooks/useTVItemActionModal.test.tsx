import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react-native";
import type React from "react";
import { Alert, type AlertButton } from "react-native";
import { useTVItemActionModal } from "./useTVItemActionModal";

const mockMarkPlayed = jest.fn<Promise<void>, [string]>();
const mockMarkUnplayed = jest.fn<Promise<void>, [string]>();
const mockPrune = jest.fn<Promise<void>, [string[]]>();
// usePlaybackManager and useInvalidatePlaybackProgressCache hand out new
// functions on every render, as the real ones do; each render's are kept to
// tell them apart.
const mockMarkPlayedByRender: jest.Mock[] = [];
const mockInvalidateByRender: jest.Mock[] = [];

jest.mock("react-i18next", () => {
  const t = (key: string) => key;
  return { useTranslation: () => ({ t }) };
});
jest.mock("@/hooks/usePlaybackManager", () => ({
  usePlaybackManager: () => {
    const markItemPlayed = jest.fn((id: string) => mockMarkPlayed(id));
    mockMarkPlayedByRender.push(markItemPlayed);
    return {
      markItemPlayed,
      markItemUnplayed: (id: string) => mockMarkUnplayed(id),
    };
  },
}));
jest.mock("@/hooks/useRevalidatePlaybackProgressCache", () => ({
  useInvalidatePlaybackProgressCache: () => {
    const invalidate = jest.fn(async () => {});
    mockInvalidateByRender.push(invalidate);
    return invalidate;
  },
}));
// The real hook hands out one function until its inputs change.
jest.mock("@/hooks/useWatchlist", () => ({
  usePruneWatchedFromWatchlist: () => mockPrune,
}));
jest.mock("@/utils/log", () => ({ logAndCaptureError: jest.fn() }));

// One client per test, kept across its renders. An infinite gcTime schedules
// no cleanup timer that would keep Jest running.
const makeWrapper = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
};

/** Opens the long-press menu for `item` and returns its played action. */
const openMenu = async (item: BaseItemDto) => {
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  const { result } = await renderHook(() => useTVItemActionModal(), {
    wrapper: makeWrapper(),
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
  mockMarkPlayedByRender.length = 0;
  mockInvalidateByRender.length = 0;
});

// The TV rows, cards and hero are memoized and take this callback as a prop:
// a new one on every render re-rendered all of them.
test("keeps showItemActions stable across renders", async () => {
  const { result, rerender } = await renderHook(() => useTVItemActionModal(), {
    wrapper: makeWrapper(),
  });
  const first = result.current.showItemActions;
  await rerender({});
  await rerender({});
  expect(result.current.showItemActions).toBe(first);
});

test("marks the item played with the functions of the latest render", async () => {
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  const { result, rerender } = await renderHook(() => useTVItemActionModal(), {
    wrapper: makeWrapper(),
  });
  await rerender({});

  await act(async () => result.current.showItemActions(movie(false)));
  const markWatched = (alert.mock.calls[0][2] as AlertButton[])[1];
  await act(async () => {
    await markWatched.onPress?.();
  });

  expect(mockMarkPlayedByRender[0]).not.toHaveBeenCalled();
  expect(mockMarkPlayedByRender.at(-1)).toHaveBeenCalledWith("m1");
  expect(mockInvalidateByRender[0]).not.toHaveBeenCalled();
  expect(mockInvalidateByRender.at(-1)).toHaveBeenCalled();
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
