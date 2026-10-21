import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react-native";
import type React from "react";
import { useMarkAsPlayed } from "./useMarkAsPlayed";

const mockMarkPlayed = jest.fn<Promise<void>, [string]>();
const mockMarkUnplayed = jest.fn<Promise<void>, [string]>();
const mockPrune = jest.fn<Promise<void>, [string[]]>();

jest.mock("@/hooks/useHaptic", () => ({ useHaptic: () => () => {} }));
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

const movie: BaseItemDto = {
  Id: "m1",
  Type: "Movie",
  UserData: { Played: false, Likes: true },
};

beforeEach(() => {
  mockMarkPlayed.mockReset().mockResolvedValue();
  mockMarkUnplayed.mockReset().mockResolvedValue();
  mockPrune.mockReset().mockResolvedValue();
});

// Jellyfin 12 keeps UserData per version, so with an alternate version
// selected the item page marks that version played. The watchlist button rates
// the page's own item, which marking the version played never took off the
// watchlist.
test("takes the item the watchlist rates off it when a version of it is marked played", async () => {
  const version: BaseItemDto = {
    Id: "m1-4k",
    Type: "Movie",
    UserData: { Played: false, Likes: false },
  };
  const { result } = await renderHook(
    () => useMarkAsPlayed([version], [movie]),
    { wrapper },
  );

  await act(() => result.current(true));

  expect(mockMarkPlayed).toHaveBeenCalledWith("m1-4k");
  expect(mockPrune).toHaveBeenCalledWith(["m1"]);
});
