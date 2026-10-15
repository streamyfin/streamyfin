import type { UserDto } from "@jellyfin/sdk/lib/generated-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { createStore, Provider as JotaiProvider } from "jotai";
import { makeApi } from "@/test-utils/jellyfinApi";
import { useItemCollections } from "./useItemCollections";

let mockApi: ReturnType<typeof makeApi> | null = null;
let mockUser: UserDto | null = null;

jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return {
    apiAtom: atom(() => mockApi),
    userAtom: atom(() => mockUser),
  };
});

const SERVER = "https://jellyfin.example.com";
const SERVER_INFO_URL = `${SERVER}/System/Info/Public`;
const collectionsUrl = (itemId: string) =>
  `${SERVER}/Items/${itemId}/Collections`;

const trilogy = { Id: "boxset-1", Name: "The Trilogy", Type: "BoxSet" };

/** A server of the given version that files `item-1` under `collections`. */
const serverRunning = (version: string, collections: unknown[] = [trilogy]) => {
  const api = makeApi();
  api.mock.onGet(SERVER_INFO_URL).reply(200, { Version: version });
  api.mock
    .onGet(collectionsUrl("item-1"))
    .reply(200, { Items: collections, TotalRecordCount: collections.length });
  mockApi = api;
  return api;
};

const collectionRequests = (api: ReturnType<typeof makeApi>) =>
  api.mock.history.get.filter((request) =>
    request.url?.endsWith("/Collections"),
  );

const renderItemCollections = async (
  // null stands for an item that has not loaded; undefined takes the default.
  itemId: string | null = "item-1",
  enabled = true,
) => {
  // No garbage collection timer nor retry: either keeps Jest from exiting.
  const client = new QueryClient({
    defaultOptions: {
      queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
    },
  });
  // A store per render: the api and user atoms are read once per store.
  const store = createStore();
  const { result } = await renderHook(
    () => useItemCollections(itemId, enabled),
    {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={client}>
          <JotaiProvider store={store}>{children}</JotaiProvider>
        </QueryClientProvider>
      ),
    },
  );
  return { result, client };
};

/** Lets the server version land, and anything it would set off after it. */
const untilServerVersionIsKnown = async (client: QueryClient) => {
  await waitFor(() =>
    expect(client.getQueryState(["jellyfin", "serverInfo"])?.status).toBe(
      "success",
    ),
  );
  // React Query hands its state updates to a timer.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

describe("useItemCollections", () => {
  beforeEach(() => {
    mockApi = null;
    mockUser = { Id: "user-1" };
  });

  test("returns the collections a Jellyfin 12 server files the item under", async () => {
    const api = serverRunning("12.0.0");

    const { result } = await renderItemCollections();

    await waitFor(() => expect(result.current.data).toEqual([trilogy]));
    const [request] = collectionRequests(api);
    expect(request.url).toBe(collectionsUrl("item-1"));
    expect(request.params).toEqual({
      userId: "user-1",
      fields: "PrimaryImageAspectRatio",
    });
    // Called raw, so nothing but this attaches the token.
    expect(request.headers?.Authorization).toContain("SECRET_TOKEN");
  });

  test("asks a Jellyfin 12 release candidate too", async () => {
    serverRunning("12.0.0-rc5");

    const { result } = await renderItemCollections();

    await waitFor(() => expect(result.current.data).toEqual([trilogy]));
  });

  // The endpoint does not exist before Jellyfin 12: asking would 404 on every
  // details page a 10.11 user opens.
  test("never asks a 10.11 server", async () => {
    const api = serverRunning("10.11.11");

    const { result, client } = await renderItemCollections();
    await untilServerVersionIsKnown(client);

    expect(collectionRequests(api)).toHaveLength(0);
    expect(result.current.data).toBeUndefined();
  });

  test("does not ask before the server version is known", async () => {
    const api = makeApi();
    // The version request never answers.
    api.mock.onGet(SERVER_INFO_URL).reply(() => new Promise(() => {}));
    api.mock.onGet(collectionsUrl("item-1")).reply(200, { Items: [trilogy] });
    mockApi = api;

    const { result } = await renderItemCollections();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(collectionRequests(api)).toHaveLength(0);
    expect(result.current.data).toBeUndefined();
  });

  test("returns an empty list for an item in no collection", async () => {
    serverRunning("12.0.0", []);

    const { result } = await renderItemCollections();

    await waitFor(() => expect(result.current.data).toEqual([]));
  });

  test("returns an empty list when the server leaves Items out", async () => {
    const api = makeApi();
    api.mock.onGet(SERVER_INFO_URL).reply(200, { Version: "12.0.0" });
    api.mock.onGet(collectionsUrl("item-1")).reply(200, {});
    mockApi = api;

    const { result } = await renderItemCollections();

    await waitFor(() => expect(result.current.data).toEqual([]));
  });

  // Favoriting an item, or marking it played, rewrites every query cached
  // under ["item", itemId] as if it held the item. A list kept there comes
  // back as a plain object and the row crashes mapping over it.
  test("keeps its list when the item's own queries are rewritten", async () => {
    serverRunning("12.0.0");
    const { result, client } = await renderItemCollections();
    await waitFor(() => expect(result.current.data).toEqual([trilogy]));

    await act(async () => {
      client.setQueriesData<object>({ queryKey: ["item", "item-1"] }, (old) =>
        old ? { ...old, UserData: { IsFavorite: true } } : old,
      );
    });

    expect(result.current.data).toEqual([trilogy]);
  });

  test("asks nothing while disabled, not even the server version", async () => {
    const api = serverRunning("12.0.0");

    const { result } = await renderItemCollections("item-1", false);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(api.mock.history.get).toHaveLength(0);
    expect(result.current.data).toBeUndefined();
  });

  test("asks nothing for an item that has not loaded yet", async () => {
    const api = serverRunning("12.0.0");

    const { result, client } = await renderItemCollections(null);
    await untilServerVersionIsKnown(client);

    expect(collectionRequests(api)).toHaveLength(0);
    expect(result.current.data).toBeUndefined();
  });
});
