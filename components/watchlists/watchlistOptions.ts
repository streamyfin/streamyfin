import type { TFunction } from "i18next";
import type {
  StreamystatsWatchlistAllowedItemType,
  StreamystatsWatchlistSortOrder,
} from "@/utils/streamystats/types";

/** The content a watchlist can be limited to, as its create and edit screens offer it. */
export const watchlistItemTypes = (
  t: TFunction,
): Array<{ value: StreamystatsWatchlistAllowedItemType; label: string }> => [
  { value: null, label: t("watchlists.all_types") },
  { value: "Movie", label: t("watchlists.movies_only") },
  { value: "Series", label: t("watchlists.series_only") },
  { value: "Episode", label: t("watchlists.episodes_only") },
];

/** The orders a watchlist can list its items in. */
export const watchlistSortOptions = (
  t: TFunction,
): Array<{ value: StreamystatsWatchlistSortOrder; label: string }> => [
  { value: "custom", label: t("watchlists.sort_custom") },
  { value: "name", label: t("watchlists.sort_name") },
  { value: "dateAdded", label: t("watchlists.sort_date_added") },
  { value: "releaseDate", label: t("watchlists.sort_release_date") },
];

/**
 * A watchlist's content type as the options name it, or the server's value
 * for a type the app has no label for.
 */
export const watchlistTypeLabel = (
  t: TFunction,
  type: string | undefined,
): string | undefined =>
  type
    ? (watchlistItemTypes(t).find((option) => option.value === type)?.label ??
      type)
    : undefined;
