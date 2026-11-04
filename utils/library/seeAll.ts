import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { SortByOption, SortOrderOption } from "@/utils/atoms/filters";

/**
 * The sort a Recently added row's "See all" opens its library with. A Shows
 * row lists series by their newest episode, so the library page must sort by
 * that date too; by the series' own added date the first rows would differ
 * from the ones the user just saw.
 */
export const recentlyAddedSeeAllParams = (
  collectionType: BaseItemDto["CollectionType"] | null | undefined,
): { sortBy: SortByOption; sortOrder: SortOrderOption } => ({
  sortBy:
    collectionType === "tvshows"
      ? SortByOption.DateLastContentAdded
      : SortByOption.DateCreated,
  sortOrder: SortOrderOption.Descending,
});
