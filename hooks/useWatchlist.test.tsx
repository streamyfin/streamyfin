import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react-native";
import { getDefaultStore } from "jotai";
import type React from "react";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { writeToLog } from "@/utils/log";
import { usePruneWatchedFromWatchlist, useWatchlist } from "./useWatchlist";

const mockRemove = jest.fn<
  Promise<{ removed: string[]; failed: string[] }>,
  [unknown, string, string[]]
>();
const mockSettings = { useKefinTweaks: true };
const mockConnection = { isOffline: false, isConnected: true };

jest.mock("@/utils/watchlistPrune", () => ({
  removeWatchedFromWatchlist: (...args: [unknown, string, string[]]) =>
    mockRemove(...args),
}));
const mockRate = jest.fn<Promise<unknown>, [unknown]>();
jest.mock("@jellyfin/sdk/lib/utils/api", () => ({
  getUserLibraryApi: () => ({
    updateUserItemRating: (params: unknown) => mockRate(params),
  }),
}));
jest.mock("@/utils/atoms/settings", () => ({
  useSettings: () => ({ settings: mockSettings }),
}));
jest.mock("@/utils/log", () => ({ writeToLog: jest.fn() }));
jest.mock("@/providers/OfflineModeProvider", () => ({
  useOfflineMode: () => mockConnection.isOffline,
}));
jest.mock("@/hooks/useNetworkStatus", () => ({
  useNetworkStatus: () => ({ isConnected: mockConnection.isConnected }),
}));
jest.mock("sonner-native", () => ({ toast: { error: jest.fn() } }));
jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return { apiAtom: atom({}), userAtom: atom({ Id: "u" }) };
});

// An infinite gcTime schedules no cleanup timer; a settled mutation's default
// five-minute one would keep Jest from exiting.
const newClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { gcTime: Infinity },
      mutations: { gcTime: Infinity },
    },
  });

const wrapperFor =
  (client: QueryClient) =>
  ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

const wrapper = ({ children }: { children: React.ReactNode }) =>
  wrapperFor(newClient())({ children });

const store = getDefaultStore();

const movie = { Id: "m1", Type: "Movie" as const, UserData: { Likes: true } };

/** A mounted bookmark toggle and the prune callback, sharing one store. */
const renderBoth = () =>
  renderHook(
    () => ({
      toggle: useWatchlist(movie),
      prune: usePruneWatchedFromWatchlist(),
    }),
    { wrapper },
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockRemove.mockReset();
  mockSettings.useKefinTweaks = true;
  mockConnection.isOffline = false;
  mockConnection.isConnected = true;
  store.set(apiAtom, {} as never);
  store.set(userAtom, { Id: "u" } as never);
});

test("does nothing while KefinTweaks is off", async () => {
  mockSettings.useKefinTweaks = false;
  const { result } = await renderBoth();

  await act(() => result.current.prune(["m1"]));

  expect(mockRemove).not.toHaveBeenCalled();
});

// Marking a downloaded episode played offline must not fire requests that can
// only fail and log a warning each time.
test.each([
  ["in offline mode", { isOffline: true, isConnected: true }],
  ["without a connection", { isOffline: false, isConnected: false }],
])("does nothing %s", async (_label, connection) => {
  Object.assign(mockConnection, connection);
  const { result } = await renderBoth();

  await act(() => result.current.prune(["m1"]));

  expect(mockRemove).not.toHaveBeenCalled();
});

// The toggle on screen reads the shared atom before its item query, so the
// prune has to flip the atom or the bookmark stays filled until a refetch.
test("unfills a mounted bookmark for an item it removed", async () => {
  mockRemove.mockResolvedValue({ removed: ["m1"], failed: [] });
  const { result } = await renderBoth();
  expect(result.current.toggle.isWatchlisted).toBe(true);

  await act(() => result.current.prune(["m1"]));

  expect(mockRemove).toHaveBeenCalledWith(expect.anything(), "u", ["m1"]);
  expect(result.current.toggle.isWatchlisted).toBe(false);
});

test("swallows a failure so playback teardown is never interrupted", async () => {
  mockRemove.mockRejectedValue(new Error("offline"));
  const { result } = await renderBoth();

  await expect(
    act(() => result.current.prune(["m1"])),
  ).resolves.toBeUndefined();
  expect(result.current.toggle.isWatchlisted).toBe(true);
});

test("logs the items it could not prune and still unfills the ones it removed", async () => {
  mockRemove.mockResolvedValue({ removed: ["m1"], failed: ["m2"] });
  const { result } = await renderBoth();

  await act(() => result.current.prune(["m1", "m2"]));

  expect(result.current.toggle.isWatchlisted).toBe(false);
  expect(writeToLog).toHaveBeenCalledWith(
    "WARN",
    expect.any(String),
    expect.stringContaining("m2"),
  );
});

/**
 * Renders a toggle whose rating request stays open until `fail` is called,
 * with the item's query already cached as the signed-in account sees it.
 */
const renderPendingToggle = async () => {
  let fail: (error: Error) => void = () => {};
  mockRate.mockImplementation(
    () =>
      new Promise((_resolve, reject) => {
        fail = reject;
      }),
  );
  const client = newClient();
  client.setQueryData(["item", "m1"], {
    Id: "m1",
    Name: "first account's copy",
    UserData: { Likes: true },
  });
  const view = await renderHook(() => useWatchlist(movie), {
    wrapper: wrapperFor(client),
  });
  await act(async () => view.result.current.toggleWatchlist());
  return {
    client,
    view,
    fail: (error: Error) =>
      act(async () => {
        fail(error);
        await new Promise((resolve) => setTimeout(resolve, 0));
      }),
  };
};

test("rolls the item back when the toggle fails", async () => {
  const { client, fail } = await renderPendingToggle();
  expect(client.getQueryData(["item", "m1"])).toMatchObject({
    UserData: { Likes: false },
  });

  await fail(new Error("server said no"));

  expect(client.getQueryData(["item", "m1"])).toMatchObject({
    UserData: { Likes: true },
  });
});

// Logging out clears the cache and unmounts the page, but a request already
// sent still settles. Its rollback must not put the first account's item back
// into the cache the next account reads.
test("does not roll back into the cache after the account changed", async () => {
  const { client, view, fail } = await renderPendingToggle();

  await view.unmount();
  client.clear();
  store.set(userAtom, { Id: "someone-else" } as never);
  const nextAccountsCopy = {
    Id: "m1",
    Name: "second account's copy",
    UserData: { Likes: false },
  };
  client.setQueryData(["item", "m1"], nextAccountsCopy);

  await fail(new Error("server said no"));

  expect(client.getQueryData(["item", "m1"])).toEqual(nextAccountsCopy);
});

test("rates the item through the SDK", async () => {
  mockRate.mockResolvedValue({});
  const { result } = await renderHook(() => useWatchlist(movie), { wrapper });

  await act(async () => result.current.toggleWatchlist());

  expect(mockRate).toHaveBeenCalledWith({
    itemId: "m1",
    userId: "u",
    likes: false,
  });
});

/**
 * Library grids as `[libraryId].tsx` caches them: the filters ride the key,
 * the server filter list last.
 */
const seedLibraryGrids = (client: QueryClient) => {
  const grid = (filterBy: string[]) => [
    "library-items",
    "lib",
    [],
    [],
    [],
    ["SortName"],
    ["Ascending"],
    filterBy,
  ];
  const keys = {
    watchlist: grid(["Likes"]),
    favoritesOrWatchlist: grid(["IsFavoriteOrLikes"]),
    unplayed: grid(["IsUnplayed"]),
  };
  for (const key of Object.values(keys)) {
    client.setQueryData(key, { pages: [], pageParams: [] });
  }
  return (name: keyof typeof keys) =>
    client.getQueryState(keys[name])?.isInvalidated;
};

// The library's "Watchlist" filter lists by Likes; without a refetch an item
// taken off the watchlist stays in that grid until a manual refresh.
test("refreshes the library grids filtered by the watchlist after a toggle", async () => {
  mockRate.mockResolvedValue({});
  const client = newClient();
  const invalidated = seedLibraryGrids(client);
  const { result } = await renderHook(() => useWatchlist(movie), {
    wrapper: wrapperFor(client),
  });

  await act(async () => result.current.toggleWatchlist());

  expect(invalidated("watchlist")).toBe(true);
  expect(invalidated("favoritesOrWatchlist")).toBe(true);
  expect(invalidated("unplayed")).toBe(false);
});

test("refreshes the library grids filtered by the watchlist after a prune", async () => {
  mockRemove.mockResolvedValue({ removed: ["m1"], failed: [] });
  const client = newClient();
  const invalidated = seedLibraryGrids(client);
  const { result } = await renderHook(() => usePruneWatchedFromWatchlist(), {
    wrapper: wrapperFor(client),
  });

  await act(() => result.current(["m1"]));

  expect(invalidated("watchlist")).toBe(true);
  expect(invalidated("favoritesOrWatchlist")).toBe(true);
  expect(invalidated("unplayed")).toBe(false);
});

// A list kept the old Likes value, and a toggle mounted from it later wrote
// that value back over the one just set.
test("a toggle mounted from a cached list after a flip shows the new value", async () => {
  mockRate.mockResolvedValue({});
  const client = newClient();
  client.setQueryData(["seasons", "show"], [movie]);
  const { result } = await renderHook(() => useWatchlist(movie), {
    wrapper: wrapperFor(client),
  });

  await act(async () => result.current.toggleWatchlist());

  const fromList = client.getQueryData<(typeof movie)[]>([
    "seasons",
    "show",
  ])![0];
  const card = await renderHook(() => useWatchlist(fromList), {
    wrapper: wrapperFor(client),
  });
  expect(card.result.current.isWatchlisted).toBe(false);
  expect(result.current.isWatchlisted).toBe(false);
});

test("a card mounted from a cached list after a prune shows it removed", async () => {
  mockRemove.mockResolvedValue({ removed: ["m1"], failed: [] });
  const client = newClient();
  client.setQueryData(["home", "watchlist", "u", "movies"], {
    pages: [[movie]],
    pageParams: [0],
  });
  const { result } = await renderHook(() => usePruneWatchedFromWatchlist(), {
    wrapper: wrapperFor(client),
  });

  await act(() => result.current(["m1"]));

  const fromList = client.getQueryData<{ pages: (typeof movie)[][] }>([
    "home",
    "watchlist",
    "u",
    "movies",
  ])!.pages[0][0];
  const card = await renderHook(() => useWatchlist(fromList), {
    wrapper: wrapperFor(client),
  });
  expect(card.result.current.isWatchlisted).toBe(false);
});

// Every card in a grid mounts one of these; a card must not re-render
// because another card's entry was written.
test("does not re-render for another item's entry", async () => {
  const client = newClient();
  let renders = 0;
  const { result } = await renderHook(
    () => {
      renders++;
      return useWatchlist(movie);
    },
    { wrapper: wrapperFor(client) },
  );
  expect(result.current.isWatchlisted).toBe(true);
  const before = renders;

  // A second toggle in the same store writes its own entry on mount.
  await renderHook(
    () => useWatchlist({ Id: "m2", UserData: { Likes: false } }),
    { wrapper: wrapperFor(client) },
  );

  expect(renders).toBe(before);
});

// isPending only changes after a re-render, so a second tap landing before it
// saw nothing in flight and sent the opposite value too.
test("sends one request for a double tap, and takes the next tap once it settles", async () => {
  let settle: () => void = () => {};
  mockRate.mockImplementation(
    () =>
      new Promise((resolve) => {
        settle = () => resolve({});
      }),
  );
  const { result } = await renderHook(() => useWatchlist(movie), {
    wrapper: wrapperFor(newClient()),
  });

  await act(async () => {
    result.current.toggleWatchlist();
    result.current.toggleWatchlist();
  });
  expect(mockRate).toHaveBeenCalledTimes(1);

  await act(async () => settle());
  await act(async () => result.current.toggleWatchlist());
  expect(mockRate).toHaveBeenCalledTimes(2);
});
