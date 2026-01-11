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
    // Create a proxy-like object that inherits from queryClient
    // but overrides invalidateQueries
    const wrapped = Object.create(queryClient) as NetworkAwareQueryClient;
    wrapped.invalidateQueries = networkAwareInvalidate;
    wrapped.forceInvalidateQueries =
      queryClient.invalidateQueries.bind(queryClient);
    return wrapped;
  }, [queryClient, networkAwareInvalidate]);
}
