import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react-native";
import type React from "react";
import { toast } from "sonner-native";
import {
  useAddToWatchlist,
  useCreateWatchlist,
  useDeleteWatchlist,
  useRemoveFromWatchlist,
  useUpdateWatchlist,
} from "@/hooks/useWatchlistMutations";

const mockApi = {
  createWatchlist: jest.fn(),
  updateWatchlist: jest.fn(),
  deleteWatchlist: jest.fn(),
  addWatchlistItem: jest.fn(),
  removeWatchlistItem: jest.fn(),
};
let mockSettings: Record<string, unknown> = {};

jest.mock("@/utils/streamystats/api", () => ({
  createStreamystatsApi: () => mockApi,
}));
jest.mock("@/hooks/useNetworkAwareQueryClient", () => ({
  useNetworkAwareQueryClient: () => ({
    invalidateQueries: jest.fn(),
    removeQueries: jest.fn(),
  }),
}));
jest.mock("@/utils/atoms/settings", () => ({
  useSettings: () => ({ settings: mockSettings }),
}));
jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return { apiAtom: atom({ accessToken: "token" }) };
});
jest.mock("sonner-native", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));
// The key, and its values when there are some, stand for the translation.
jest.mock("i18next", () => ({
  t: (key: string, values?: object) =>
    values ? `${key} ${JSON.stringify(values)}` : key,
}));

// No garbage collection timer, so Jest can exit when the specs end.
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider
    client={
      new QueryClient({
        defaultOptions: {
          mutations: { gcTime: Number.POSITIVE_INFINITY },
        },
      })
    }
  >
    {children}
  </QueryClientProvider>
);

/** Runs a mutation to its end, whether it succeeds or not. */
const run = async <V,>(
  hook: () => { mutateAsync: (variables: V) => Promise<unknown> },
  variables: V,
) => {
  const { result } = await renderHook(hook, { wrapper });
  await act(async () => {
    await result.current.mutateAsync(variables).catch(() => {});
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSettings = { streamyStatsServerUrl: "http://stats" };
  for (const call of Object.values(mockApi)) {
    call.mockResolvedValue({ data: {} });
  }
});

// The messages were English strings, whatever the app's language.
describe("watchlist toasts", () => {
  test("say a watchlist was created, updated or deleted in the app's language", async () => {
    await run(useCreateWatchlist, { name: "Sunday films" });
    await run(useUpdateWatchlist, { watchlistId: 1, data: { name: "x" } });
    await run(useDeleteWatchlist, 1);

    expect(jest.mocked(toast.success).mock.calls).toEqual([
      ["watchlists.toasts.created"],
      ["watchlists.toasts.updated"],
      ["watchlists.toasts.deleted"],
    ]);
  });

  test("name the watchlist an item went into or left", async () => {
    await run(useAddToWatchlist, {
      watchlistId: 1,
      itemId: "item",
      watchlistName: "Sunday films",
    });
    await run(useRemoveFromWatchlist, {
      watchlistId: 1,
      itemId: "item",
      watchlistName: "Sunday films",
    });

    expect(jest.mocked(toast.success).mock.calls).toEqual([
      ['watchlists.toasts.added_to {"name":"Sunday films"}'],
      ['watchlists.toasts.removed_from {"name":"Sunday films"}'],
    ]);
  });

  test("fall back to their own words when the server gives none", async () => {
    mockApi.createWatchlist.mockRejectedValue(new Error(""));

    await run(useCreateWatchlist, { name: "Sunday films" });

    expect(toast.error).toHaveBeenCalledWith("watchlists.toasts.create_failed");
  });

  test("tell the user Streamystats is not set up", async () => {
    mockSettings = {};

    await run(useCreateWatchlist, { name: "Sunday films" });

    expect(toast.error).toHaveBeenCalledWith("watchlists.not_configured_title");
  });
});
