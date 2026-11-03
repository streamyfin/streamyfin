import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import {
  type DehydrateOptions,
  dehydrate,
  MutationCache,
  MutationObserver,
  onlineManager,
  QueryClient,
  QueryObserver,
} from "@tanstack/react-query";
import {
  type PersistedClient,
  type Persister,
  persistQueryClientRestore,
  persistQueryClientSave,
} from "@tanstack/react-query-persist-client";
import {
  MAX_PERSISTED_PAGES,
  PERSISTED_QUERY_FAMILIES,
  UNTRIMMED_INFINITE_FAMILIES,
} from "@/constants/QueryPersistence";
import {
  queryDehydrateOptions,
  withoutPersistedMutations,
} from "./queryPersistence";

const clients: QueryClient[] = [];
const mutationErrors: unknown[] = [];

// The app's client, as far as persistence goes: mutations wait for the network,
// and a failed one reaches the cache level handler that reports to Sentry.
const newClient = () => {
  const client = new QueryClient({
    mutationCache: new MutationCache({
      onError: (error) => {
        mutationErrors.push(error);
      },
    }),
    defaultOptions: {
      queries: { retry: false },
      mutations: { networkMode: "online" },
    },
  });
  clients.push(client);
  return client;
};

// One device's storage, read and written through the persister the app uses,
// so the spec never has to know the key it stores under.
const newDisk = () => {
  const values = new Map<string, string>();
  return createSyncStoragePersister({
    storage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value);
      },
      removeItem: (key) => {
        values.delete(key);
      },
    },
    throttleTime: 0,
  });
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

// What a favourite toggled without a connection leaves behind.
const mutateWhileOffline = (client: QueryClient) => {
  onlineManager.setOnline(false);
  new MutationObserver(client, { mutationFn: async (itemId: string) => itemId })
    .mutate("item-1")
    .catch(() => {});
};

// Quitting the app: the cache goes to disk through the same save and the same
// JSON round trip as in the app.
const quit = async (
  client: QueryClient,
  disk: Persister,
  options: DehydrateOptions,
) => {
  await persistQueryClientSave({
    queryClient: client,
    persister: disk,
    dehydrateOptions: options,
  });
  // The persister writes on a timer, even with no throttle.
  await flush();
};

// The next launch: restore, mount, then the network comes back. That online
// event is what resumes paused mutations on a mounted client, and it is the
// path in the Sentry stack, so nothing here resumes them by hand.
const relaunch = async (disk: Persister) => {
  const client = newClient();
  await persistQueryClientRestore({
    queryClient: client,
    persister: withoutPersistedMutations(disk),
  });
  client.mount();
  onlineManager.setOnline(false);
  onlineManager.setOnline(true);
  await flush();
  return client;
};

beforeEach(() => {
  mutationErrors.length = 0;
  onlineManager.setOnline(true);
});

afterEach(() => {
  for (const client of clients.splice(0)) {
    client.unmount();
    // clear() drops a mutation without stopping its collection timer, and that
    // timer keeps Jest from exiting.
    for (const mutation of client.getMutationCache().getAll()) {
      mutation.destroy();
    }
    client.clear();
  }
  onlineManager.setOnline(true);
});

describe("queryDehydrateOptions", () => {
  test("a mutation paused while offline is not persisted", async () => {
    const client = newClient();
    mutateWhileOffline(client);
    await flush();

    expect(client.getMutationCache().getAll()[0].state.isPaused).toBe(true);
    expect(dehydrate(client, queryDehydrateOptions).mutations).toEqual([]);
  });

  // Sentry REACT-NATIVE-EV: the restored mutation has no mutationFn, so
  // resuming it threw "No mutationFn found".
  test("a mutation started offline is not replayed after a restart", async () => {
    const disk = newDisk();
    const before = newClient();
    mutateWhileOffline(before);
    await flush();
    await quit(before, disk, queryDehydrateOptions);

    const after = await relaunch(disk);

    expect(mutationErrors).toEqual([]);
    expect(after.getMutationCache().getAll()).toEqual([]);
  });

  test("a successful query is persisted", () => {
    const client = newClient();
    client.setQueryData(["home", "resumeItems"], { Name: "Alien" });

    expect(
      dehydrate(client, queryDehydrateOptions).queries.map(
        (query) => query.queryKey,
      ),
    ).toEqual([["home", "resumeItems"]]);
  });

  test("a query that opted out with gcTime 0 is not persisted", async () => {
    const client = newClient();
    // Mounted like a useQuery, or a gcTime of 0 collects it before the check.
    const unsubscribe = new QueryObserver(client, {
      queryKey: ["home", "stream-url"],
      queryFn: async () => "https://example.com/stream",
      gcTime: 0,
    }).subscribe(() => {});
    await flush();

    expect(client.getQueryState(["home", "stream-url"])?.status).toBe(
      "success",
    );
    expect(dehydrate(client, queryDehydrateOptions).queries).toEqual([]);
    unsubscribe();
  });

  test("a failed query and one without data yet are not persisted", async () => {
    const client = newClient();
    await client
      .fetchQuery({
        queryKey: ["home", "failed"],
        queryFn: async () => {
          throw new Error("boom");
        },
      })
      .catch(() => {});
    new QueryObserver(client, {
      queryKey: ["home", "not-loaded"],
      enabled: false,
    });

    expect(client.getQueryState(["home", "failed"])?.status).toBe("error");
    expect(client.getQueryState(["home", "not-loaded"])?.status).toBe(
      "pending",
    );
    expect(dehydrate(client, queryDehydrateOptions).queries).toEqual([]);
  });
});

const persistedKeys = (client: QueryClient) =>
  dehydrate(client, queryDehydrateOptions).queries.map(
    (query) => query.queryKey[0],
  );

describe("which query families are persisted", () => {
  // What launch and offline browsing read: Home, the library list, music.
  test.each([
    ["Home's sections", ["home", "userViews", "user-1"]],
    ["Home's hero", ["home", "heroItems", "user-1"]],
    ["the Libraries tab", ["user-views", "user-1"]],
    ["a library's header", ["library", "lib-1"]],
    ["a library card's count", ["library-count", "lib-1"]],
    ["the server info Streamystats rows wait for", ["jellyfin", "serverInfo"]],
    ["a Streamystats row on Home", ["streamystats", "watchlists", "url", "u"]],
    ["music suggestions", ["music-latest", "lib-1", "user-1"]],
    ["music artists", ["music-artists", "lib-1", "user-1"]],
    ["a music album", ["music-album-tracks", "album-1", "user-1"]],
    ["a music playlist", ["music-playlist-tracks", "pl-1", "user-1"]],
  ])("%s is persisted", (_name, queryKey) => {
    const client = newClient();
    client.setQueryData(queryKey, { Name: "Alien" });

    expect(persistedKeys(client)).toEqual([queryKey[0]]);
  });

  // None of these is needed to launch or to browse without a connection, and
  // each one grows the blob that is parsed on every launch.
  test.each([
    ["search results", ["search", "movies", "alien"]],
    ["an item's detail page", ["item", "item-1", ["Overview"]]],
    ["a library's pages", ["library-items", "lib-1", "items"]],
    ["the episodes of a season", ["episodes", "season-1", false]],
    ["the segments of a stream", ["segments", "item-1", false]],
    ["the sessions of the server", ["sessions"]],
    ["Seerr", ["seerr", "discover", "trending"]],
    ["Live TV", ["livetv", "channels"]],
    ["a query nobody opted in", ["brand-new-feature", "data"]],
  ])("%s is not persisted", (_name, queryKey) => {
    const client = newClient();
    client.setQueryData(queryKey, { Name: "Alien" });

    expect(persistedKeys(client)).toEqual([]);
  });

  // Dropping a family here empties a screen the first time it is opened
  // without a connection. The keys are read from the screens themselves, so
  // a renamed key fails here instead of going unpersisted.
  test.each([
    "components/home/Home.tsx",
    "components/home/Home.tv.tsx",
    "components/home/HomeHeroCarousel.tsx",
    "components/library/Libraries.tsx",
    "components/library/LibraryItemCard.tsx",
    "app/(auth)/(tabs)/(libraries)/music/[libraryId]/suggestions.tsx",
    "app/(auth)/(tabs)/(libraries)/music/[libraryId]/artists.tsx",
    "app/(auth)/(tabs)/(libraries)/music/[libraryId]/albums.tsx",
    "app/(auth)/(tabs)/(libraries)/music/[libraryId]/playlists.tsx",
  ])("%s only reads persisted query families", (file) => {
    const source = readFileSync(join(__dirname, "..", file), "utf8");
    const families = [...source.matchAll(/queryKey: *\[\s*"([^"]+)"/g)].map(
      (match) => match[1],
    );

    expect(families.length).toBeGreaterThan(0);
    for (const family of families) {
      expect(PERSISTED_QUERY_FAMILIES).toContain(family);
    }
  });
});

describe("infinite queries", () => {
  const pages = (count: number) => ({
    pages: Array.from({ length: count }, (_, page) => ({ page })),
    pageParams: Array.from({ length: count }, (_, page) => page * 40),
  });

  test("only the first pages are written", () => {
    const client = newClient();
    client.setQueryData(["home", "latest", "user-1"], pages(30));

    const [query] = dehydrate(client, queryDehydrateOptions).queries;
    const data = query.state.data as ReturnType<typeof pages>;

    expect(data.pages).toHaveLength(MAX_PERSISTED_PAGES);
    expect(data.pageParams).toHaveLength(MAX_PERSISTED_PAGES);
    expect(data.pages[0]).toEqual({ page: 0 });
  });

  // The cache is the only offline source for music: a 500 album library at 40
  // a page is 13 pages, and an album past the third would be unreachable.
  test.each(UNTRIMMED_INFINITE_FAMILIES)(
    "a %s list is written with every page",
    (family) => {
      const client = newClient();
      client.setQueryData([family, "lib-1", "user-1"], pages(13));

      const [query] = dehydrate(client, queryDehydrateOptions).queries;
      const data = query.state.data as ReturnType<typeof pages>;

      expect(data.pages).toHaveLength(13);
      expect(data.pageParams).toEqual(pages(13).pageParams);
    },
  );

  test("only persisted music lists are exempt from the trim", () => {
    for (const family of UNTRIMMED_INFINITE_FAMILIES) {
      expect(PERSISTED_QUERY_FAMILIES).toContain(family);
    }
  });

  test("the query in memory keeps every page", () => {
    const client = newClient();
    client.setQueryData(["home", "latest", "user-1"], pages(30));
    dehydrate(client, queryDehydrateOptions);

    expect(
      (client.getQueryData(["home", "latest", "user-1"]) as any).pages,
    ).toHaveLength(30);
  });

  test("a list that is not paged is written whole", () => {
    const client = newClient();
    const list = Array.from({ length: 50 }, (_, index) => ({ index }));
    client.setQueryData(["home", "userViews", "user-1"], list);

    const [query] = dehydrate(client, queryDehydrateOptions).queries;

    expect(query.state.data).toEqual(list);
  });
});

describe("the cache written before the allowlist", () => {
  // A blob from 0.55.x holds every query the user ever opened.
  const oldBlob = async () => {
    const disk = newDisk();
    const client = newClient();
    client.setQueryData(["home", "resumeItems"], { Name: "Alien" });
    client.setQueryData(["music-albums", "lib-1", "user-1"], { Name: "Abbey" });
    client.setQueryData(["search", "movies", "alien"], { Name: "Aliens" });
    client.setQueryData(["item", "item-1", []], { Name: "Alien" });
    await quit(client, disk, {
      shouldDehydrateQuery: (query) => query.state.status === "success",
    });
    return disk;
  };

  test("the first launch still has what the offline screens read", async () => {
    const client = await relaunch(await oldBlob());

    expect(client.getQueryData(["home", "resumeItems"])).toEqual({
      Name: "Alien",
    });
    expect(client.getQueryData(["music-albums", "lib-1", "user-1"])).toEqual({
      Name: "Abbey",
    });
  });

  test("the first write after it drops the families that are no longer persisted", async () => {
    const disk = await oldBlob();
    const client = await relaunch(disk);
    await quit(client, disk, queryDehydrateOptions);

    const restored = await relaunch(disk);

    expect(
      restored
        .getQueryCache()
        .getAll()
        .map((query) => query.queryKey[0])
        .sort(),
    ).toEqual(["home", "music-albums"]);
  });
});

describe("withoutPersistedMutations", () => {
  // 0.55.0 only filtered queries, so its caches can hold paused mutations.
  const releasedDehydrateOptions: DehydrateOptions = {
    shouldDehydrateQuery: queryDehydrateOptions.shouldDehydrateQuery,
  };

  const cacheWrittenBy0550 = async () => {
    const disk = newDisk();
    const client = newClient();
    client.setQueryData(["home", "resumeItems"], { Name: "Alien" });
    mutateWhileOffline(client);
    await flush();
    await quit(client, disk, releasedDehydrateOptions);
    return disk;
  };

  test("a paused mutation already on disk is not replayed on the first launch after the update", async () => {
    const disk = await cacheWrittenBy0550();
    expect((await disk.restoreClient())?.clientState.mutations).toHaveLength(1);

    const client = await relaunch(disk);

    expect(mutationErrors).toEqual([]);
    expect(client.getMutationCache().getAll()).toEqual([]);
  });

  test("the queries in that cache are still restored", async () => {
    const client = await relaunch(await cacheWrittenBy0550());

    expect(client.getQueryData(["home", "resumeItems"])).toEqual({
      Name: "Alien",
    });
  });

  test("saving and clearing still reach a persister that keeps its methods on a prototype", async () => {
    class MemoryPersister implements Persister {
      saved?: PersistedClient;
      persistClient(persisted: PersistedClient) {
        this.saved = persisted;
      }
      restoreClient() {
        return this.saved;
      }
      removeClient() {
        this.saved = undefined;
      }
    }
    const memory = new MemoryPersister();
    const persister = withoutPersistedMutations(memory);
    const client = newClient();
    client.setQueryData(["home", "resumeItems"], { Name: "Alien" });

    await persistQueryClientSave({
      queryClient: client,
      persister,
      dehydrateOptions: queryDehydrateOptions,
    });
    expect(memory.saved?.clientState.queries).toHaveLength(1);

    await persister.removeClient();
    expect(memory.saved).toBeUndefined();
  });

  test("an empty disk restores nothing", async () => {
    const client = await relaunch(newDisk());

    expect(mutationErrors).toEqual([]);
    expect(client.getQueryCache().getAll()).toEqual([]);
  });
});
