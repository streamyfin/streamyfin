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

jest.mock("@/utils/watchlistPrune", () => ({
  removeWatchedFromWatchlist: (...args: [unknown, string, string[]]) =>
    mockRemove(...args),
}));
jest.mock("@/utils/atoms/settings", () => ({
  useSettings: () => ({ settings: mockSettings }),
}));
jest.mock("@/utils/log", () => ({ writeToLog: jest.fn() }));
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
  store.set(apiAtom, {} as never);
  store.set(userAtom, { Id: "u" } as never);
});

test("does nothing while KefinTweaks is off", async () => {
  mockSettings.useKefinTweaks = false;
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
  store.set(apiAtom, {
    post: () =>
      new Promise((_resolve, reject) => {
        fail = reject;
      }),
  } as never);
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
