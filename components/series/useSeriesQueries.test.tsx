import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react-native";
import { createStore, Provider as JotaiProvider } from "jotai";
import type { ReactNode } from "react";
import type { DownloadedItem } from "@/providers/Downloads/types";
import { userAtom } from "@/providers/JellyfinProvider";
import { useSeriesQueries } from "./useSeriesQueries";

let mockDownloads: DownloadedItem[] = [];
let mockRefreshKey = 0;
const mockGetDownloadedItems = jest.fn(() => mockDownloads);
const mockGetUserItemData = jest.fn();
const mockGetEpisodes = jest.fn();

jest.mock("@/providers/DownloadProvider", () => ({
  useDownload: () => ({
    refreshKey: mockRefreshKey,
    getDownloadedItems: mockGetDownloadedItems,
  }),
}));
jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return {
    apiAtom: atom({ basePath: "http://server", accessToken: "token" }),
    userAtom: atom(null),
  };
});
jest.mock("@jellyfin/sdk/lib/utils/api", () => ({
  getShowApi: () => ({ getEpisodes: mockGetEpisodes }),
}));
jest.mock("@/utils/jellyfin/user-library/getUserItemData", () => ({
  getUserItemData: (...args: unknown[]) => mockGetUserItemData(...args),
}));

const SERIES_ID = "series-1";

const episode = (index: number): BaseItemDto => ({
  Id: `episode-${index}`,
  Type: "Episode",
  Name: `Episode ${index}`,
  SeriesId: SERIES_ID,
  SeriesName: "Show",
  ParentIndexNumber: 1,
  IndexNumber: index,
});

const downloaded = (item: BaseItemDto) => ({ item }) as DownloadedItem;

/** Renders the hook and records every answer it gave, render by render. */
const renderSeriesQueries = async (isOffline: boolean) => {
  // No garbage collection timer nor retry: either keeps Jest from exiting.
  const client = new QueryClient({
    defaultOptions: {
      queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
    },
  });
  const store = createStore();
  store.set(userAtom, { Id: "user" });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <JotaiProvider store={store}>{children}</JotaiProvider>
    </QueryClientProvider>
  );
  const seen: ReturnType<typeof useSeriesQueries>[] = [];
  const view = await renderHook(
    () => {
      const answer = useSeriesQueries(SERIES_ID, isOffline);
      seen.push(answer);
      return answer;
    },
    { wrapper },
  );
  return { ...view, seen };
};

beforeEach(() => {
  mockRefreshKey = 0;
  mockDownloads = [];
  mockGetDownloadedItems.mockClear();
  mockGetUserItemData.mockReset();
  mockGetEpisodes.mockReset();
});

describe("useSeriesQueries online", () => {
  // Keyed on the downloads, each episode that finished downloading gave the
  // series a new key: the page went blank and was fetched again, once per
  // episode, so a series download flashed the whole screen.
  test("keeps the series and asks nothing more as downloads finish", async () => {
    mockGetUserItemData.mockResolvedValue({ Id: SERIES_ID, Name: "Show" });
    mockGetEpisodes.mockResolvedValue({ data: { Items: [episode(1)] } });
    const { result, rerender, seen } = await renderSeriesQueries(false);
    await waitFor(() => expect(result.current.allEpisodes).toHaveLength(1));
    expect(result.current.item?.Id).toBe(SERIES_ID);

    seen.length = 0;
    mockDownloads = [downloaded(episode(1))];
    mockRefreshKey++;
    await rerender({});

    expect(seen.map((answer) => answer.item?.Id)).not.toContain(undefined);
    expect(mockGetUserItemData).toHaveBeenCalledTimes(1);
    expect(mockGetEpisodes).toHaveBeenCalledTimes(1);
  });
});

describe("useSeriesQueries offline", () => {
  // Offline the keys follow every download refresh, and closing the player is
  // one. Without the previous answer held, the series read as nothing for a
  // render: the page returned null, then mounted again from the top.
  test("keeps the series and its episodes while a refresh reads again", async () => {
    mockDownloads = [downloaded(episode(1)), downloaded(episode(2))];
    const { result, rerender, seen } = await renderSeriesQueries(true);
    await waitFor(() => expect(result.current.allEpisodes).toHaveLength(2));
    const reads = mockGetDownloadedItems.mock.calls.length;

    seen.length = 0;
    mockRefreshKey++;
    await rerender({});
    await waitFor(() =>
      expect(mockGetDownloadedItems.mock.calls.length).toBeGreaterThan(reads),
    );

    expect(seen.map((answer) => answer.item?.Id)).not.toContain(undefined);
    expect(seen.map((answer) => answer.allEpisodes?.length)).not.toContain(
      undefined,
    );
    expect(seen.map((answer) => answer.isLoading)).not.toContain(true);
  });

  test("shows what the refresh read", async () => {
    mockDownloads = [downloaded(episode(1)), downloaded(episode(2))];
    const { result, rerender } = await renderSeriesQueries(true);
    await waitFor(() => expect(result.current.allEpisodes).toHaveLength(2));

    mockDownloads = [downloaded(episode(2))];
    mockRefreshKey++;
    await rerender({});

    await waitFor(() =>
      expect(result.current.allEpisodes?.map((item) => item.Id)).toEqual([
        "episode-2",
      ]),
    );
  });
});
