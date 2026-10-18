import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { screen } from "@testing-library/react-native";
import { getDefaultStore } from "jotai";
import { type ReactNode, useState } from "react";
import { measureRenders } from "reassure";
import WatchlistsPage from "@/app/(auth)/(tabs)/(watchlists)/index";
import { apiAtom } from "@/providers/JellyfinProvider";
import { pullToRefresh } from "@/test-utils/lists";

jest.mock(
  "@/utils/atoms/settings",
  () =>
    jest.requireActual("@/test-utils/streamystatsSettings")
      .streamystatsSettingsModule,
);
// The Streamystats server is a second API; answering for it is all it is for.
jest.mock("@/utils/streamystats/api", () => ({
  createStreamystatsApi: () => ({
    getWatchlists: async () => ({
      data: Array.from({ length: 40 }, (_, index) => ({
        id: index,
        serverId: 1,
        userId: index % 2 ? "user-1" : "someone-else",
        name: `Watchlist ${index}`,
        description: `About watchlist ${index}`,
        isPublic: true,
        isPromoted: false,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        itemCount: index,
      })),
    }),
  }),
}));

const Wrapper = ({ children }: { children: ReactNode }) => {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

describe("Watchlists Performance", () => {
  beforeEach(() => {
    Object.assign(getDefaultStore().get(apiAtom) as object, {
      accessToken: "test-token",
    });
  });

  test("the watchlists page loads its lists, then pulls to refresh", async () => {
    await measureRenders(<WatchlistsPage />, {
      wrapper: Wrapper,
      scenario: async () => {
        await screen.findByText("Watchlist 1");
        await pullToRefresh();
        await screen.findByText("Watchlist 1");
      },
    });
  }, 60_000);
});
