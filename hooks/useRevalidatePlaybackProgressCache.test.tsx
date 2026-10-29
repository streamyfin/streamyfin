import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react-native";
import { SIMILAR_ITEMS_LIMIT } from "@/constants/Recommendations";
import { useInvalidatePlaybackProgressCache } from "./useRevalidatePlaybackProgressCache";

const mockRunNextEpisodesCheck = jest.fn();
const mockSyncPlaybackState = jest.fn(async (_itemId: string) => false);
jest.mock("@/providers/DownloadProvider", () => ({
  useDownload: () => ({
    getDownloadedItems: () => [{ item: { Id: "episode-1" } }],
    runNextEpisodesCheck: mockRunNextEpisodesCheck,
  }),
}));
jest.mock("./useTwoWaySync", () => ({
  useTwoWaySync: () => ({
    syncPlaybackState: (itemId: string) => mockSyncPlaybackState(itemId),
  }),
}));

const revalidateWith = async (client: QueryClient) => {
  const { result } = await renderHook(
    () => useInvalidatePlaybackProgressCache(),
    {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    },
  );
  await result.current();
};

beforeEach(() => jest.clearAllMocks());

describe("useInvalidatePlaybackProgressCache", () => {
  // A similar-items row draws each poster's watched badge and never goes stale
  // by itself: without this, an item marked as played from the row kept
  // looking unplayed for as long as the list stayed cached.
  test("marks the similar items of every page for a refetch", async () => {
    // No garbage collection timer: it keeps Jest from exiting.
    const client = new QueryClient({
      defaultOptions: { queries: { gcTime: Number.POSITIVE_INFINITY } },
    });
    const similarKey = ["similarItems", "series-1", SIMILAR_ITEMS_LIMIT];
    const unrelatedKey = ["libraries"];
    client.setQueryData(similarKey, [{ Id: "series-2" }]);
    client.setQueryData(unrelatedKey, []);

    await revalidateWith(client);

    expect(client.getQueryState(similarKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(unrelatedKey)?.isInvalidated).toBe(false);
  });

  // An episode watched offline reaches the server in the sync; the series
  // rules are checked after it, so they see the episode as watched.
  test("checks the series rules once the downloads are synced", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { gcTime: Number.POSITIVE_INFINITY } },
    });
    mockSyncPlaybackState.mockImplementation(async () => {
      expect(mockRunNextEpisodesCheck).not.toHaveBeenCalled();
      return false;
    });

    await revalidateWith(client);

    expect(mockSyncPlaybackState).toHaveBeenCalledWith("episode-1");
    expect(mockRunNextEpisodesCheck).toHaveBeenCalledTimes(1);
  });
});
