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
  const mutationFn = jest.fn(async (itemId: string) => itemId);
  new MutationObserver(client, { mutationFn }).mutate("item-1").catch(() => {});
  return mutationFn;
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
    client.setQueryData(["item", "1"], { Name: "Alien" });

    expect(
      dehydrate(client, queryDehydrateOptions).queries.map(
        (query) => query.queryKey,
      ),
    ).toEqual([["item", "1"]]);
  });

  test("a query that opted out with gcTime 0 is not persisted", async () => {
    const client = newClient();
    // Mounted like a useQuery, or a gcTime of 0 collects it before the check.
    const unsubscribe = new QueryObserver(client, {
      queryKey: ["stream-url"],
      queryFn: async () => "https://example.com/stream",
      gcTime: 0,
    }).subscribe(() => {});
    await flush();

    expect(client.getQueryState(["stream-url"])?.status).toBe("success");
    expect(dehydrate(client, queryDehydrateOptions).queries).toEqual([]);
    unsubscribe();
  });

  test("a failed query and one without data yet are not persisted", async () => {
    const client = newClient();
    await client
      .fetchQuery({
        queryKey: ["failed"],
        queryFn: async () => {
          throw new Error("boom");
        },
      })
      .catch(() => {});
    new QueryObserver(client, { queryKey: ["not-loaded"], enabled: false });

    expect(client.getQueryState(["failed"])?.status).toBe("error");
    expect(client.getQueryState(["not-loaded"])?.status).toBe("pending");
    expect(dehydrate(client, queryDehydrateOptions).queries).toEqual([]);
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
    client.setQueryData(["item", "1"], { Name: "Alien" });
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

    expect(client.getQueryData(["item", "1"])).toEqual({ Name: "Alien" });
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
    client.setQueryData(["item", "1"], { Name: "Alien" });

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
