import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getUserLibraryApi } from "@jellyfin/sdk/lib/utils/api";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useCallback, useMemo } from "react";
import { Platform } from "react-native";
import { STUDIO_PAGE_SIZE, STUDIO_TV_PAGE_SIZE } from "@/constants/Search";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { getStudioItems, nextStartIndex } from "@/utils/jellyfin/search";

const STUDIO_STALE_TIME_MS = 60 * 1000;

/**
 * A studio and the movies and series it produced, a page at a time. Shared by
 * the phone's and the TV's studio page, which only differ in how they lay the
 * posters out.
 */
export const useStudioItems = (studioId: string) => {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const enabled = !!api && !!user?.Id && !!studioId;

  const { data: studio } = useQuery({
    queryKey: ["studio", studioId],
    queryFn: async ({ signal }) => {
      if (!api) return null;
      const response = await getUserLibraryApi(api).getItem(
        { itemId: studioId, userId: user?.Id },
        { signal },
      );
      return response.data;
    },
    enabled,
    staleTime: STUDIO_STALE_TIME_MS,
  });

  const { data, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useInfiniteQuery({
      queryKey: ["studio-items", studioId],
      queryFn: ({ pageParam, signal }) => {
        if (!api) return null;
        return getStudioItems({
          api,
          userId: user?.Id,
          studioId,
          startIndex: pageParam,
          limit: Platform.isTV ? STUDIO_TV_PAGE_SIZE : STUDIO_PAGE_SIZE,
          signal,
        });
      },
      initialPageParam: 0,
      getNextPageParam: (_lastPage, pages) => nextStartIndex(pages),
      enabled,
    });

  const items = useMemo(
    () =>
      (data?.pages.flatMap((page) => page?.Items ?? []) ?? []) as BaseItemDto[],
    [data],
  );

  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return { studio, items, isLoading, loadMore };
};
