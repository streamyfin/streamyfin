import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react-native";
import { SIMILAR_ITEMS_LIMIT } from "@/constants/Recommendations";
import { useInvalidatePlaybackProgressCache } from "./useRevalidatePlaybackProgressCache";

let mockDownloads: { item: { Id: string } }[] = [];
const mockTriggerRefresh = jest.fn();
const mockSync = jest.fn(
  async (_id: string, _options?: { push?: boolean }) => "unchanged",
);
jest.mock("@/providers/DownloadProvider", () => ({
  useDownload: () => ({
    getDownloadedItems: () => mockDownloads,
    triggerRefresh: mockTriggerRefresh,
  }),
}));
jest.mock("./useTwoWaySync", () => ({
  useTwoWaySync: () => ({ syncPlaybackStateDetailed: mockSync }),
}));

beforeEach(() => {
  mockDownloads = [];
  mockTriggerRefresh.mockClear();
  mockSync.mockReset();
  mockSync.mockImplementation(async () => "unchanged");
});

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

  // The local progress is shared by every account on the device: a pull to
  // refresh or a Home mount right after another user signed in used to send
  // the previous user's offline progress into this one. Only the offline
  // sync, which knows who queued it, may push.
  test("only takes the server's state, never sends a download's", async () => {
    mockDownloads = [
      { item: { Id: "episode-1" } },
      { item: { Id: "episode-2" } },
    ];

    await revalidateWith(new QueryClient());

    expect(mockSync.mock.calls).toEqual([
      ["episode-1", { push: false }],
      ["episode-2", { push: false }],
    ]);
  });

  test("refreshes the downloads views once a download took the server's state", async () => {
    mockDownloads = [
      { item: { Id: "episode-1" } },
      { item: { Id: "episode-2" } },
    ];
    mockSync.mockImplementation(async (id: string) =>
      id === "episode-2" ? "pulled" : "unchanged",
    );

    await revalidateWith(new QueryClient());
    expect(mockTriggerRefresh).toHaveBeenCalledTimes(1);

    mockTriggerRefresh.mockClear();
    mockSync.mockImplementation(async () => "unchanged");
    await revalidateWith(new QueryClient());
    expect(mockTriggerRefresh).not.toHaveBeenCalled();
  });
});
