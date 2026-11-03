type QueryState = {
  data: unknown;
  isLoading: boolean;
  errorUpdateCount: number;
};

export type EpisodeRowState = "loading" | "failed" | "ready";

// A query that failed and has nothing to show. It stays failed while it is
// asked for again: query-core puts a refetch of a query with no data back to
// "pending", so its loading flag alone flipped the row between the
// placeholders and the empty text on every refetch.
const failedWithNothing = (query: QueryState) =>
  query.data === undefined && query.errorUpdateCount > 0;

/**
 * What a series page's episode list shows for the seasons query and the
 * selected season's episodes query: a wait while they load, a failure, or the
 * episodes (an empty list being an empty season). `awaitingSeason` is a
 * season still being picked, whose episodes are not asked for yet.
 */
export function episodeRowState(
  seasons: QueryState,
  episodes: QueryState,
  awaitingSeason = false,
): EpisodeRowState {
  if (failedWithNothing(seasons) || failedWithNothing(episodes)) {
    return "failed";
  }
  // Until the seasons arrive no season is picked and the episodes are not
  // asked for: neither wait is an empty season.
  if (seasons.isLoading || episodes.isLoading || awaitingSeason) {
    return "loading";
  }
  return "ready";
}
