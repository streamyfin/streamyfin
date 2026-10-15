import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react-native";
import { SIMILAR_ITEMS_LIMIT } from "@/constants/Recommendations";
import { useInvalidatePlaybackProgressCache } from "./useRevalidatePlaybackProgressCache";

jest.mock("@/providers/DownloadProvider", () => ({
  useDownload: () => ({ getDownloadedItems: () => [] }),
}));
jest.mock("./useTwoWaySync", () => ({
  useTwoWaySync: () => ({ syncPlaybackState: async () => false }),
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
});
