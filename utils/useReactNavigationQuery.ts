import { useFocusEffect } from "@react-navigation/core";
import {
  type QueryKey,
  type UseQueryOptions,
  type UseQueryResult,
  useQuery,
} from "@tanstack/react-query";
import { useCallback } from "react";

export function useReactNavigationQuery<
  TQueryFnData = unknown,
  TError = unknown,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(
  options: UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
): UseQueryResult<TData, TError> {
  const useQueryReturn = useQuery(options);

  useFocusEffect(
    useCallback(() => {
      if (
        ((options.refetchOnWindowFocus && useQueryReturn.isStale) ||
          options.refetchOnWindowFocus === "always") &&
        options.enabled !== false
      )
        useQueryReturn.refetch();
    }, [options.enabled, options.refetchOnWindowFocus]),
  );

  return useQueryReturn;
}
