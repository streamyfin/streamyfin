import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getTvShowsApi } from "@jellyfin/sdk/lib/utils/api";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { UPCOMING_PAGE_SIZE } from "@/constants/Upcoming";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import {
  groupByAirDay,
  nextUpcomingStartIndex,
} from "@/utils/upcomingEpisodes";

/** One page of `/Shows/Upcoming`: episodes from yesterday on, soonest first. */
export const fetchUpcomingEpisodes = async (
  api: Api,
  params: {
    userId: string;
    parentId?: string;
    startIndex: number;
    limit: number;
  },
): Promise<BaseItemDto[]> => {
  const response = await getTvShowsApi(api).getUpcomingEpisodes({
    ...params,
    // The series' air time. The server only fills it in where it knows one.
    fields: ["AirTime"],
    imageTypeLimit: 1,
    enableImageTypes: ["Primary", "Backdrop", "Thumb"],
  });
  return response.data.Items ?? [];
};

/** Upcoming episodes of a library, or of every library, grouped by air day. */
export const useUpcomingEpisodes = (parentId?: string) => {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const userId = user?.Id;

  const query = useInfiniteQuery({
    queryKey: ["upcoming", api?.basePath, userId, parentId ?? null],
    queryFn: ({ pageParam }) =>
      fetchUpcomingEpisodes(api!, {
        userId: userId!,
        parentId,
        startIndex: pageParam,
        limit: UPCOMING_PAGE_SIZE,
      }),
    initialPageParam: 0,
    getNextPageParam: (_lastPage, pages) =>
      nextUpcomingStartIndex(pages, UPCOMING_PAGE_SIZE),
    enabled: !!api && !!userId,
    staleTime: 60 * 1000,
  });

  const groups = useMemo(
    () => groupByAirDay(query.data?.pages.flat() ?? []),
    [query.data],
  );
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;

  return {
    groups,
    isLoading: query.isLoading,
    isError: query.isError,
    isFetchingNextPage,
    loadMore: () => {
      if (hasNextPage && !isFetchingNextPage) fetchNextPage();
    },
  };
};
