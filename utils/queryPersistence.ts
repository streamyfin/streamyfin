import type { DehydrateOptions } from "@tanstack/react-query";
import type { Persister } from "@tanstack/react-query-persist-client";

/** What the query cache writes to disk. */
export const queryDehydrateOptions: DehydrateOptions = {
  shouldDehydrateQuery: (query) =>
    query.state.status === "success" && query.options.gcTime !== 0,
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
