import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { orderBy } from "lodash";

/** Which way a sort runs. */
export type SortOrder = "asc" | "desc";

/** How the Discover search orders Seerr's results. */
export enum SeerrSearchSort {
  DEFAULT = 0,
  VOTE_COUNT_AND_AVERAGE = 1,
  POPULARITY = 2,
}

/**
 * The fields a Seerr sort orders by. The screens hold the sort by its name
 * ("POPULARITY"), so the name is read back here. None for the default.
 */
const seerrSortFields = (sort: SeerrSearchSort | string | undefined) => {
  if (sort === undefined) return undefined;
  switch (Number(SeerrSearchSort[sort as keyof typeof SeerrSearchSort])) {
    case SeerrSearchSort.VOTE_COUNT_AND_AVERAGE:
      return ["voteCount", "voteAverage"];
    case SeerrSearchSort.POPULARITY:
      return ["voteCount", "popularity"];
    default:
      return undefined;
  }
};

/**
 * Orders Seerr's results the way the Discover search shows them, on the
 * phone and on TV: by the fields of the sort picked, or by default with the
 * exact title first.
 */
export const sortSeerrResults = <T>(
  results: T[] | undefined,
  sort: SeerrSearchSort | string | undefined,
  order: SortOrder | undefined,
  title: (result: T) => string | undefined,
  query: string,
): T[] =>
  orderBy(
    results,
    seerrSortFields(sort) || [
      (result: T) => title(result)?.toLowerCase() === query.toLowerCase(),
    ],
    order || "desc",
  );

/** The sorts the Library search offers. Relevance is the server's order. */
export const LIBRARY_SORTS = [
  "Relevance",
  "Name",
  "CommunityRating",
  "ProductionYear",
  "DateCreated",
] as const;
export type LibrarySort = (typeof LIBRARY_SORTS)[number];

const libraryValue: Record<
  Exclude<LibrarySort, "Relevance">,
  (item: BaseItemDto) => string | number | undefined
> = {
  Name: (item) => (item.SortName ?? item.Name ?? undefined)?.toLowerCase(),
  CommunityRating: (item) => item.CommunityRating ?? undefined,
  ProductionYear: (item) => item.ProductionYear ?? undefined,
  DateCreated: (item) =>
    item.DateCreated ? Date.parse(item.DateCreated) : undefined,
};

/**
 * Orders the Library search's results in the app, so the same ten most
 * relevant results come back whatever the search engine, only in another
 * order. What has no value for the sort goes last, in either order.
 */
export const sortLibraryResults = (
  items: BaseItemDto[] | undefined,
  sort: LibrarySort,
  order: SortOrder,
): BaseItemDto[] | undefined => {
  if (!items || sort === "Relevance") return items;
  const value = libraryValue[sort];
  const direction = order === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    const x = value(a);
    const y = value(b);
    if (x === undefined) return y === undefined ? 0 : 1;
    if (y === undefined) return -1;
    if (typeof x === "string" && typeof y === "string") {
      return x.localeCompare(y) * direction;
    }
    return ((x as number) - (y as number)) * direction;
  });
};
