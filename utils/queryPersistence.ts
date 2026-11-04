import type { DehydrateOptions } from "@tanstack/react-query";
import type { Persister } from "@tanstack/react-query-persist-client";
import {
  MAX_PERSISTED_PAGES,
  PERSISTED_QUERY_FAMILIES,
  UNTRIMMED_INFINITE_FAMILIES,
} from "@/constants/QueryPersistence";

const families = new Set(PERSISTED_QUERY_FAMILIES);
const untrimmedFamilies = new Set(UNTRIMMED_INFINITE_FAMILIES);

// serializeData receives the data and not the query, so shouldDehydrateQuery
// marks the data of the families that keep every page.
const untrimmedData = new WeakSet<object>();

const isInfiniteData = (
  data: unknown,
): data is { pages: unknown[]; pageParams: unknown[] } =>
  typeof data === "object" &&
  data !== null &&
  Array.isArray((data as { pages?: unknown }).pages) &&
  Array.isArray((data as { pageParams?: unknown }).pageParams);

/**
 * What the query cache writes to disk. A save snapshots the whole cache, so a
 * query this rejects is gone from disk at the first save after an update, while
 * the restored copy keeps serving the session that restored it.
 */
export const queryDehydrateOptions: DehydrateOptions = {
  // gcTime 0 is how a query keeps itself off disk, and must stay excluded.
  shouldDehydrateQuery: (query) => {
    const persisted =
      query.state.status === "success" &&
      query.options.gcTime !== 0 &&
      families.has(String(query.queryKey[0]));
    const data: unknown = query.state.data;
    if (
      persisted &&
      typeof data === "object" &&
      data !== null &&
      untrimmedFamilies.has(String(query.queryKey[0]))
    ) {
      untrimmedData.add(data);
    }
    return persisted;
  },
  // Runs on the copy being written, never on the query in memory.
  serializeData: (data) =>
    isInfiniteData(data) && !untrimmedData.has(data)
      ? {
          ...data,
          pages: data.pages.slice(0, MAX_PERSISTED_PAGES),
          pageParams: data.pageParams.slice(0, MAX_PERSISTED_PAGES),
        }
      : data,
  // TanStack persists paused mutations by default, the ones started while
  // offline. A restored mutation only gets its mutationFn back from
  // setMutationDefaults, which the app never calls, so resuming one after a
  // restart threw "No mutationFn found". withoutPersistedMutations drops them on
  // restore as well, so making mutations survive a restart means changing both.
  shouldDehydrateMutation: () => false,
};

/**
 * Drops the mutations from a restored cache. A cache written before mutations
 * stopped being persisted can still hold paused ones, and hydrating them would
 * replay the failure once more on the first launch after the update.
 */
export const withoutPersistedMutations = (persister: Persister): Persister => ({
  // Delegated rather than spread: a spread would lose methods a persister
  // keeps on its prototype.
  persistClient: (persisted) => persister.persistClient(persisted),
  removeClient: () => persister.removeClient(),
  restoreClient: async () => {
    const persisted = await persister.restoreClient();
    if (!persisted) return persisted;
    return {
      ...persisted,
      clientState: { ...persisted.clientState, mutations: [] },
    };
  },
});

/**
 * Skips a save that would write what the last one wrote. The persister saves
 * the whole cache on every cache event, including those of the queries it
 * never writes: the Sessions badge polls `["sessions"]` every 5 s for an admin,
 * and each poll rewrote the cache. A persisted query only changes on disk when
 * its data or its invalidation does, so those decide.
 */
export const withoutRedundantSaves = (persister: Persister): Persister => {
  let lastWritten: string | undefined;
  return {
    persistClient: (persisted) => {
      const written = persisted.clientState.queries
        .map(
          ({ queryHash, state }) =>
            `${queryHash}@${state.dataUpdatedAt}${state.isInvalidated ? "!" : ""}`,
        )
        .join("|");
      if (written === lastWritten) return;
      lastWritten = written;
      return persister.persistClient(persisted);
    },
    restoreClient: () => persister.restoreClient(),
    // A later save must not be skipped against what is no longer on disk.
    removeClient: () => {
      lastWritten = undefined;
      return persister.removeClient();
    },
  };
};
