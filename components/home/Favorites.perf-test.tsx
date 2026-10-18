import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, screen } from "@testing-library/react-native";
import { getDefaultStore } from "jotai";
import { type ReactNode, useState } from "react";
import { measureRenders } from "reassure";
import FavoritesPage from "@/app/(auth)/(tabs)/(favorites)/index";
import { apiAtom } from "@/providers/JellyfinProvider";
import { makeItems } from "@/test-utils/baseItems";
import type { makeApi } from "@/test-utils/jellyfinApi";

jest.mock("@/hooks/useRevalidatePlaybackProgressCache", () => ({
  useInvalidatePlaybackProgressCache: () => async () => {},
}));
jest.mock("@/providers/NetworkStatusProvider", () => ({
  useNetworkStatus: () => ({ isConnected: true, serverConnected: true }),
}));
jest.mock("@/providers/DownloadProvider", () => ({
  useDownload: () => ({ downloadedItems: [], processes: [] }),
}));
jest.mock("@/providers/GlobalModalProvider", () => ({
  useGlobalModal: () => ({ showModal: () => {}, hideModal: () => {} }),
}));

const api = getDefaultStore().get(apiAtom) as ReturnType<typeof makeApi>;

const stubServer = () => {
  api.mock.reset();
  api.mock.onGet(/\/Items\?/).reply((config) => {
    const type = new URL(config.url!, "http://server").searchParams.get(
      "includeItemTypes",
    );
    return [200, { Items: makeItems(20, `Favorite ${type}`, "Movie") }];
  });
};

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

describe("Favorites Performance", () => {
  beforeEach(() => {
    stubServer();
  });

  test("the favorites page loads a row for every kind of item", async () => {
    await measureRenders(<FavoritesPage />, {
      wrapper: Wrapper,
      scenario: async () => {
        await screen.findAllByText("Favorite Movie 0");
        await act(async () => {
          jest.advanceTimersByTime(500);
        });
      },
    });
  }, 60_000);
});
