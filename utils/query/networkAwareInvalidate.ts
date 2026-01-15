import {
  type InvalidateOptions,
  type InvalidateQueryFilters,
  onlineManager,
  type QueryClient,
} from "@tanstack/react-query";

/**
 * Invalidates queries only when online. When offline, the invalidation
 * is skipped to preserve cached data for offline use.
 */
export function invalidateQueriesWhenOnline(
  queryClient: QueryClient,
  filters: InvalidateQueryFilters,
  options?: InvalidateOptions,
): Promise<void> {
  if (!onlineManager.isOnline()) {
    return Promise.resolve();
  }
  return queryClient.invalidateQueries(filters, options);
}
