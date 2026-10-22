interface RowQuery {
  /** No data yet: still loading, or waiting for the network to come back. */
  isPending: boolean;
  isError: boolean;
  /** How many items the row shows. */
  itemCount: number;
}

/**
 * What a row of the favorites and watchlist screens tells the screen once its
 * query has settled: whether it is empty (null while that is unknown) and
 * whether it failed with nothing to show.
 *
 * A row with no data yet is unknown, not empty: a first load paused offline
 * has no error and no items, and read as empty it had the screen say there
 * was nothing on the watchlist. A refetch that fails keeps the loaded items
 * on screen, so it is neither empty nor a failure the screen has to report.
 */
export const rowLoadState = ({
  isPending,
  isError,
  itemCount,
}: RowQuery): { isEmpty: boolean | null; failed: boolean } => {
  const failed = isError && itemCount === 0;
  return { isEmpty: isPending || failed ? null : itemCount === 0, failed };
};
