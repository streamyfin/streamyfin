import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { createStore, Provider as JotaiProvider } from "jotai";
import { makeApi } from "@/test-utils/jellyfinApi";
import { useLibraryTabs } from "./useLibraryTabs";

let mockApi: ReturnType<typeof makeApi>;

jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return {
    apiAtom: atom(() => mockApi),
    userAtom: atom({ Id: "user-1" }),
  };
});

const MOVIES: BaseItemDto = {
  Id: "library-1",
  Type: "CollectionFolder",
  CollectionType: "movies",
};

/** The query of every /Items request the hook sent. */
const itemRequests = () =>
  mockApi.mock.history.get
    .filter((request) => request.url?.includes("/Items"))
    .map(
      (request) => new URL(request.url ?? "", "https://server").searchParams,
    );

/** A server of the given version, answering each type with its total. */
const serve = (version: string, totals: Record<string, number>) => {
  mockApi = makeApi();
  mockApi.mock.onGet(/\/System\/Info\/Public/).reply(200, { Version: version });
  mockApi.mock.onGet(/\/Items/).reply((request) => {
    const type = new URL(request.url ?? "", "https://server").searchParams.get(
      "includeItemTypes",
    );
    return [200, { Items: [], TotalRecordCount: totals[type ?? ""] ?? 0 }];
  });
  return totals;
};

const renderLibraryTabs = async (library: BaseItemDto = MOVIES) => {
  // No garbage collection timer nor retry: either keeps Jest from exiting.
  const client = new QueryClient({
    defaultOptions: {
      queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
    },
  });
  // A store per render: the api atom is read once per store.
  const store = createStore();
  const { result, rerender } = await renderHook(
    (current: BaseItemDto) => useLibraryTabs(current),
    {
      initialProps: library,
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={client}>
          <JotaiProvider store={store}>{children}</JotaiProvider>
        </QueryClientProvider>
      ),
    },
  );
  return { result, rerender, client };
};

describe("useLibraryTabs", () => {
  test("offers the tabs that hold something, and hides the empty one", async () => {
    serve("12.0.0", { BoxSet: 3, Playlist: 0 });

    const { result } = await renderLibraryTabs();

    await waitFor(() =>
      expect(result.current.tabs).toEqual(["items", "collections"]),
    );
    expect(result.current.activeTab).toBe("items");
  });

  test("counts under the library, the way the grid lists them", async () => {
    serve("12.0.0", { BoxSet: 1, Playlist: 1 });

    const { result } = await renderLibraryTabs();
    await waitFor(() => expect(result.current.tabs).toHaveLength(3));

    const requests = itemRequests();
    expect(
      requests.map((query) => query.get("includeItemTypes")).sort(),
    ).toEqual(["BoxSet", "Playlist"]);
    for (const query of requests) {
      expect(query.get("parentId")).toBe("library-1");
      expect(query.get("recursive")).toBe("true");
    }
  });

  // Jellyfin 10.11 drops the library from a BoxSet query: the count would be
  // every collection on the server, and the tab would list them all.
  test("asks an older server nothing, and offers no tab", async () => {
    serve("10.11.11", { BoxSet: 3, Playlist: 3 });

    const { result } = await renderLibraryTabs();

    await waitFor(() =>
      expect(
        mockApi.mock.history.get.some((request) =>
          request.url?.includes("/System/Info/Public"),
        ),
      ).toBe(true),
    );
    // React Query hands its state updates to a timer.
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(result.current.tabs).toEqual(["items"]);
    expect(itemRequests()).toEqual([]);
  });

  test("falls back to the items when the selected tab empties out", async () => {
    const totals = serve("12.0.0", { BoxSet: 1, Playlist: 0 });

    const { result, client } = await renderLibraryTabs();
    await waitFor(() =>
      expect(result.current.tabs).toEqual(["items", "collections"]),
    );
    await act(async () => result.current.setActiveTab("collections"));
    expect(result.current.activeTab).toBe("collections");

    // The last collection is deleted, and LibraryChanged invalidates the key.
    totals.BoxSet = 0;
    await act(() => client.invalidateQueries({ queryKey: ["library-items"] }));

    await waitFor(() => expect(result.current.tabs).toEqual(["items"]));
    expect(result.current.activeTab).toBe("items");
  });

  test("a tab chosen for one library is not carried over to the next", async () => {
    serve("12.0.0", { BoxSet: 1, Playlist: 1 });

    const { result, rerender } = await renderLibraryTabs();
    await waitFor(() => expect(result.current.tabs).toHaveLength(3));
    await act(async () => result.current.setActiveTab("collections"));

    await rerender({ ...MOVIES, Id: "library-2" });
    await waitFor(() => expect(result.current.tabs).toHaveLength(3));

    expect(result.current.activeTab).toBe("items");
  });
});
