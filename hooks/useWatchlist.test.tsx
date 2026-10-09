import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react-native";
import { createStore, Provider as JotaiProvider } from "jotai";
import type React from "react";
import { usePruneWatchedFromWatchlist, useWatchlist } from "./useWatchlist";

const mockRemove = jest.fn<
  Promise<{ removed: string[]; failures: unknown[] }>,
  [unknown, string, string[]]
>();
const mockRate = jest.fn<Promise<unknown>, [{ likes: boolean }]>();
const mockWriteToLog = jest.fn();
const mockState = { useKefinTweaks: true, isOffline: false, isConnected: true };

jest.mock("@/utils/watchlistPrune", () => ({
  removeWatchedFromWatchlist: (...args: [unknown, string, string[]]) =>
    mockRemove(...args),
}));
jest.mock("@jellyfin/sdk/lib/utils/api", () => ({
  getUserLibraryApi: () => ({
    updateUserItemRating: (params: { likes: boolean }) => mockRate(params),
  }),
}));
jest.mock("@/utils/atoms/settings", () => ({
  useSettings: () => ({
    settings: { useKefinTweaks: mockState.useKefinTweaks },
  }),
}));
jest.mock("@/providers/OfflineModeProvider", () => ({
  useOfflineMode: () => mockState.isOffline,
}));
jest.mock("@/hooks/useNetworkStatus", () => ({
  useNetworkStatus: () => ({ isConnected: mockState.isConnected }),
}));
jest.mock("@/utils/log", () => ({
  writeToLog: (...args: unknown[]) => mockWriteToLog(...args),
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock("sonner-native", () => ({ toast: { error: jest.fn() } }));
jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return { apiAtom: atom({}), userAtom: atom({ Id: "u" }) };
});

const movie: BaseItemDto = {
  Id: "m1",
  Type: "Movie",
  UserData: { Likes: true, Played: false },
};

let client: QueryClient;
let store: ReturnType<typeof createStore>;

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={client}>
    <JotaiProvider store={store}>{children}</JotaiProvider>
  </QueryClientProvider>
);

/** A mounted bookmark toggle and the prune callback, sharing one store. */
const renderBoth = (item: BaseItemDto = movie) =>
  renderHook(
    () => ({
      toggle: useWatchlist(item),
      prune: usePruneWatchedFromWatchlist(),
    }),
    { wrapper },
  );

beforeEach(() => {
  store = createStore();
  client = new QueryClient({
    // No garbage collection timer: a pending one keeps Jest from exiting.
    defaultOptions: {
      queries: { gcTime: Infinity, retry: false },
      mutations: { gcTime: Infinity },
    },
  });
  mockRemove.mockReset();
  mockRemove.mockResolvedValue({ removed: [], failures: [] });
  mockRate.mockReset();
  mockRate.mockResolvedValue({});
  mockWriteToLog.mockReset();
  Object.assign(mockState, {
    useKefinTweaks: true,
    isOffline: false,
    isConnected: true,
  });
});

describe("usePruneWatchedFromWatchlist", () => {
  test("does nothing while KefinTweaks is off", async () => {
    mockState.useKefinTweaks = false;
    const { result } = await renderBoth();

    await act(() => result.current.prune([movie]));

    expect(mockRemove).not.toHaveBeenCalled();
  });

  // Marking a downloaded item played offline only changes local state; the
  // server lookups could only fail.
  test.each([
    ["offline mode", { isOffline: true }],
    ["no connection", { isConnected: false }],
  ])("does nothing in %s", async (_label, state) => {
    Object.assign(mockState, state);
    const { result } = await renderBoth();

    await act(() => result.current.prune([movie]));

    expect(mockRemove).not.toHaveBeenCalled();
  });

  // The server's Played stays true from an earlier watch, so a rewatch
  // abandoned after a minute looked finished and left the watchlist.
  test("leaves an item that was played before alone", async () => {
    const rewatch = { ...movie, UserData: { Likes: true, Played: true } };
    const { result } = await renderBoth();

    await act(() => result.current.prune([rewatch, movie]));

    expect(mockRemove).toHaveBeenCalledWith(expect.anything(), "u", ["m1"]);
    mockRemove.mockClear();
    await act(() => result.current.prune([rewatch]));
    expect(mockRemove).not.toHaveBeenCalled();
  });

  // The toggle on screen reads the shared atom before its item query, so the
  // prune has to flip the atom or the bookmark stays filled until a refetch.
  test("unfills a mounted bookmark for an item it removed", async () => {
    mockRemove.mockResolvedValue({ removed: ["m1"], failures: [] });
    const { result } = await renderBoth();
    expect(result.current.toggle.isWatchlisted).toBe(true);

    await act(() => result.current.prune([movie]));

    expect(result.current.toggle.isWatchlisted).toBe(false);
  });

  test("applies the removals that succeeded when others failed", async () => {
    mockRemove.mockResolvedValue({
      removed: ["m1"],
      failures: [new Error("404")],
    });
    const { result } = await renderBoth();

    await act(() => result.current.prune([movie]));

    expect(result.current.toggle.isWatchlisted).toBe(false);
    expect(mockWriteToLog).toHaveBeenCalledWith(
      "WARN",
      expect.any(String),
      "404",
    );
  });

  test("takes a removed item out of cached lists too", async () => {
    mockRemove.mockResolvedValue({ removed: ["m1"], failures: [] });
    client.setQueryData(["seasons", "show"], [movie]);
    const { result } = await renderBoth();

    await act(() => result.current.prune([movie]));

    expect(
      client.getQueryData<BaseItemDto[]>(["seasons", "show"])?.[0].UserData
        ?.Likes,
    ).toBe(false);
  });
});

describe("useWatchlist", () => {
  test("rates the item through the SDK", async () => {
    const { result } = await renderBoth();

    await act(async () => result.current.toggle.toggleWatchlist());

    expect(mockRate).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: "m1", userId: "u", likes: false }),
    );
  });

  // A list kept the old Likes value, and a toggle mounted from it later wrote
  // that value back over the one just set.
  test("a toggle mounted from a cached list after a flip shows the new value", async () => {
    client.setQueryData(["seasons", "show"], [movie]);
    const { result } = await renderBoth();

    await act(async () => result.current.toggle.toggleWatchlist());

    const fromList = client.getQueryData<BaseItemDto[]>([
      "seasons",
      "show",
    ])![0];
    const remounted = await renderBoth(fromList);
    expect(remounted.result.current.toggle.isWatchlisted).toBe(false);
  });

  test("puts the value back when the request fails", async () => {
    mockRate.mockRejectedValue(new Error("500"));
    const { result } = await renderBoth();

    await act(async () => result.current.toggle.toggleWatchlist());

    expect(result.current.toggle.isWatchlisted).toBe(true);
  });

  // Every card in a grid mounts one of these; a card must not re-render
  // because another card's entry was written.
  test("does not re-render for another item's entry", async () => {
    let renders = 0;
    const other: BaseItemDto = { Id: "m2", UserData: { Likes: false } };
    const { result } = await renderHook(
      () => {
        renders++;
        return useWatchlist(movie);
      },
      { wrapper },
    );
    const before = renders;
    expect(result.current.isWatchlisted).toBe(true);

    // A second toggle in the same store writes its own entry on mount.
    await renderHook(() => useWatchlist(other), { wrapper });

    expect(renders).toBe(before);
  });
});
