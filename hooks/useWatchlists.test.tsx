import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react-native";
import type React from "react";
import { useWatchlistsQuery } from "./useWatchlists";

const mockGetWatchlists = jest.fn();

// Only the server address matters here; the real settings module reaches native modules.
jest.mock("@/utils/atoms/settings", () => ({
  useSettings: () => ({
    settings: { streamyStatsServerUrl: "http://streamystats.test" },
  }),
}));
jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return {
    apiAtom: atom({ accessToken: "token" }),
    userAtom: atom({ Id: "user-1" }),
  };
});
jest.mock("@/utils/streamystats/api", () => ({
  createStreamystatsApi: () => ({
    getWatchlists: (...args: unknown[]) => mockGetWatchlists(...args),
  }),
}));

// A Streamystats server that takes the connection and never answers costs a
// full timeout per attempt: with the app's retries on top, the tab waited four
// of them before saying the lists could not be loaded, where Retry is offered.
test("the watchlists are asked for once before the failure shows", async () => {
  mockGetWatchlists.mockRejectedValue(new Error("timeout of 15000ms exceeded"));
  // The app's own policy: failed queries are retried.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: 3, retryDelay: 0, gcTime: Infinity } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  const { result } = await renderHook(() => useWatchlistsQuery(), { wrapper });

  await waitFor(() => expect(result.current.isError).toBe(true));
  expect(mockGetWatchlists).toHaveBeenCalledTimes(1);
  client.clear();
});
