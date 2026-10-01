import { useInfiniteQuery } from "@tanstack/react-query";
import { uniqBy } from "lodash";
import { useMemo } from "react";
import { Endpoints, useSeerr } from "@/hooks/useSeerr";
import { nextResultsPage } from "@/utils/seerr/search";
import {
  DiscoverSliderType,
  type MovieResult,
  type TvResult,
} from "@/utils/seerr/types";

/** Where a genre's or a company's titles come from on Seerr. */
export type SeerrTitlesSource =
  | { kind: "genre"; type: DiscoverSliderType; id: string }
  | { kind: "company"; type: DiscoverSliderType; id: string };

const endpointOf = (
  source: SeerrTitlesSource,
): { endpoint: string; params: Record<string, unknown> } => {
  // The type arrives as a string when it came through a route's params.
  const type = Number(source.type);
  if (source.kind === "genre")
    return {
      endpoint:
        type === DiscoverSliderType.MOVIE_GENRES
          ? Endpoints.DISCOVER_MOVIES
          : Endpoints.DISCOVER_TV,
      params: { genre: source.id },
    };
  return {
    endpoint: `${
      type === DiscoverSliderType.NETWORKS
        ? Endpoints.DISCOVER_TV_NETWORK
        : Endpoints.DISCOVER_MOVIES_STUDIO
    }/${source.id}`,
    params: {},
  };
};

/**
 * The titles of a genre, a network or a studio, page after page, for the
 * phone's pages and the TV's alike.
 */
export const useSeerrDiscoverTitles = (source: SeerrTitlesSource) => {
  const { seerrApi, isSeerrMovieOrTvResult } = useSeerr();
  const { endpoint, params } = endpointOf(source);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useInfiniteQuery({
      queryKey: ["seerr", source.kind, source.type, source.id],
      queryFn: async ({ pageParam }) =>
        seerrApi?.discover(endpoint, {
          ...params,
          page: Number(pageParam),
        }),
      enabled: !!seerrApi && !!source.id,
      initialPageParam: 1,
      // None past the last page: an endless list asked for empty ones.
      getNextPageParam: (lastPage) => nextResultsPage(lastPage),
      staleTime: 0,
    });

  const titles = useMemo(
    () =>
      uniqBy(
        data?.pages
          ?.filter((p) => p?.results.length)
          .flatMap(
            (p) => p?.results.filter((r) => isSeerrMovieOrTvResult(r)) ?? [],
          ),
        "id",
      ) as (MovieResult | TvResult)[],
    [data, isSeerrMovieOrTvResult],
  );

  return {
    titles,
    // Not while a page is on its way: a TV grid asks at every scroll event,
    // and each call cancelled the fetch in flight to start it again.
    loadMore: () => {
      if (hasNextPage && !isFetchingNextPage) fetchNextPage();
    },
    isLoading,
  };
};
