import type {
  InvalidateOptions,
  InvalidateQueryFilters,
  QueryClient,
  QueryKey,
} from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { invalidateQueriesWhenOnline } from "@/utils/query/networkAwareInvalidate";

type NetworkAwareQueryClient = QueryClient & {
  forceInvalidateQueries: QueryClient["invalidateQueries"];
};

/**
 * Returns a queryClient wrapper with network-aware invalidation.
 * Use this instead of useQueryClient when you need to invalidate queries.
 *
 * - invalidateQueries: Only invalidates when online (preserves offline cache)
 * - forceInvalidateQueries: Always invalidates (use sparingly)
 */
export function useNetworkAwareQueryClient(): NetworkAwareQueryClient {
  const queryClient = useQueryClient();

  const networkAwareInvalidate = useCallback(
    <TTaggedQueryKey extends QueryKey = QueryKey>(
      filters?: InvalidateQueryFilters<TTaggedQueryKey>,
      options?: InvalidateOptions,
    ): Promise<void> => {
      if (!filters) {
        return Promise.resolve();
      }
      return invalidateQueriesWhenOnline(queryClient, filters, options);
    },
    [queryClient],
  );

  return useMemo(() => {
    // Use a Proxy to wrap the queryClient and override invalidateQueries.
    // Object.create doesn't work because QueryClient uses private fields (#)
    // which can only be accessed on the exact instance they were defined on.
    const forceInvalidate = queryClient.invalidateQueries.bind(queryClient);

    return new Proxy(queryClient, {
      get(target, prop) {
        if (prop === "invalidateQueries") {
          return networkAwareInvalidate;
        }
        if (prop === "forceInvalidateQueries") {
          return forceInvalidate;
        }
        const value = Reflect.get(target, prop, target);
        // Bind methods to the original target to preserve private field access
        if (typeof value === "function") {
          return value.bind(target);
        }
        return value;
      },
    }) as NetworkAwareQueryClient;
  }, [queryClient, networkAwareInvalidate]);
}
