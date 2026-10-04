import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react-native";
import type React from "react";
import { usePruneWatchedFromWatchlist, useWatchlist } from "./useWatchlist";

const mockRemove = jest.fn<Promise<string[]>, [unknown, string, string[]]>();
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

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider
    client={
      new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } })
    }
  >
    {children}
  </QueryClientProvider>
);

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
  mockRemove.mockReset();
  mockSettings.useKefinTweaks = true;
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
  mockRemove.mockResolvedValue(["m1"]);
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
