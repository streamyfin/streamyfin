import type {
  BaseItemDto,
  CollectionType,
} from "@jellyfin/sdk/lib/generated-client/models";
import {
  FilterByOption,
  SortByOption,
  type SortOption,
  sortOptions,
} from "@/utils/atoms/filters";
import { resolveSortKey } from "./sortOption";

/**
 * What kind of thing a library page lists, for choosing its sort and filter
 * sets. "mixed" is a collection folder with no type, and "boxsets" also covers
 * a single box set opened from a collection screen.
 */
export type LibraryKind = CollectionType | "mixed" | "boxsets";

export type FilterGroupKey =
  | "genres"
  | "years"
  | "tags"
  | "officialRatings"
  | "audioLanguages"
  | "subtitleLanguages"
  | "filterBy";

export interface LibraryFilterSet {
  /** Ordered, Default first. */
  sort: readonly SortByOption[];
  /** Replaces the shared label of a sort key in this kind. */
  sortLabels?: Partial<Record<SortByOption, string>>;
  groups: readonly FilterGroupKey[];
  /** The base choices of the filter by group; the app's Watchlist is added on top. */
  filterBy: readonly FilterByOption[];
}

/**
 * The kind of a library or collection item. An item that is not loaded yet, or
 * a type without a row of its own, reads as "mixed", which offers the widest
 * set, so nothing disappears while the page loads.
 */
export const libraryKindFor = (
  item: Pick<BaseItemDto, "Type" | "CollectionType"> | null | undefined,
): LibraryKind => {
  if (item?.CollectionType) return item.CollectionType;
  if (item?.Type === "BoxSet") return "boxsets";
  if (item?.Type === "Playlist") return "playlists";
  return "mixed";
};

const S = SortByOption;

const label = (key: SortByOption): string =>
  sortOptions.find((option) => option.key === key)?.value ?? key;

const FILTER_BY: readonly FilterByOption[] = [
  FilterByOption.IsFavoriteOrLikes,
  FilterByOption.IsUnplayed,
  FilterByOption.IsPlayed,
  FilterByOption.IsFavorite,
  FilterByOption.IsResumable,
];

const BASE_GROUPS: readonly FilterGroupKey[] = [
  "genres",
  "years",
  "tags",
  "officialRatings",
  "filterBy",
];

const LANGUAGE_GROUPS: readonly FilterGroupKey[] = [
  "genres",
  "years",
  "tags",
  "officialRatings",
  "audioLanguages",
  "subtitleLanguages",
  "filterBy",
];

const VIDEO_SORT: readonly SortByOption[] = [
  S.Default,
  S.SortName,
  S.Random,
  S.CommunityRating,
  S.DateCreated,
  S.DatePlayed,
  S.OfficialRating,
  S.PlayCount,
  S.ProductionYear,
  S.Runtime,
];

const ALL_SORT_KEYS: readonly SortByOption[] = sortOptions.map((o) => o.key);

const UNTYPED: LibraryFilterSet = {
  sort: ALL_SORT_KEYS,
  groups: BASE_GROUPS,
  filterBy: FILTER_BY,
};

// The lists follow jellyfin-web's sort and filter buttons. Its production
// year sort already falls back to the premiere date, so that option is not
// offered on its own, and Studio, Start Date, Air Time and Index Number are
// not offered for these kinds at all.
const SETS: Record<LibraryKind, LibraryFilterSet> = {
  movies: {
    sort: [
      S.Default,
      S.SortName,
      S.Random,
      S.CommunityRating,
      S.CriticRating,
      S.DateCreated,
      S.DatePlayed,
      S.OfficialRating,
      S.PlayCount,
      S.ProductionYear,
      S.Runtime,
    ],
    groups: LANGUAGE_GROUPS,
    filterBy: FILTER_BY,
  },
  // Right above the episode date, the series' own date says whose it is.
  tvshows: {
    sort: [
      S.Default,
      S.SortName,
      S.Random,
      S.CommunityRating,
      S.DateCreated,
      S.DateLastContentAdded,
      S.DatePlayed,
      S.OfficialRating,
      S.ProductionYear,
    ],
    sortLabels: {
      [S.DateCreated]: "Date Show Added",
      [S.DateLastContentAdded]: "Date Episode Added",
    },
    groups: LANGUAGE_GROUPS,
    filterBy: FILTER_BY,
  },
  boxsets: {
    sort: [
      S.Default,
      S.SortName,
      S.Random,
      S.CommunityRating,
      S.DateCreated,
      S.OfficialRating,
      S.ProductionYear,
    ],
    groups: BASE_GROUPS,
    filterBy: FILTER_BY,
  },
  playlists: {
    sort: [
      S.Default,
      S.SortName,
      S.Random,
      S.DateCreated,
      S.DateLastContentAdded,
      S.ProductionYear,
      S.Runtime,
    ],
    sortLabels: { [S.DateLastContentAdded]: "Date Playlist Updated" },
    groups: BASE_GROUPS,
    filterBy: FILTER_BY,
  },
  homevideos: { sort: VIDEO_SORT, groups: BASE_GROUPS, filterBy: FILTER_BY },
  musicvideos: { sort: VIDEO_SORT, groups: BASE_GROUPS, filterBy: FILTER_BY },
  mixed: {
    sort: [
      S.Default,
      S.SortName,
      S.Random,
      S.CommunityRating,
      S.CriticRating,
      S.DateCreated,
      S.DateLastContentAdded,
      S.DatePlayed,
      S.OfficialRating,
      S.PlayCount,
      S.ProductionYear,
      S.Runtime,
    ],
    sortLabels: { [S.DateLastContentAdded]: "Date Episode Added" },
    groups: LANGUAGE_GROUPS,
    filterBy: FILTER_BY,
  },
  // Kinds without a sort UI of their own yet (the music one is a later change)
  // keep the full shared list and the groups they always had. They have no
  // language filters: the Filters2 gate never offered those there.
  music: UNTYPED,
  books: UNTYPED,
  photos: UNTYPED,
  trailers: UNTYPED,
  livetv: UNTYPED,
  folders: UNTYPED,
  unknown: UNTYPED,
};

export const libraryFilterSetFor = (kind: LibraryKind): LibraryFilterSet =>
  SETS[kind] ?? SETS.mixed;

// Built once, so a list is safe to use as a hook dependency.
const SORT_OPTIONS = Object.fromEntries(
  (Object.keys(SETS) as LibraryKind[]).map((kind) => {
    const { sort, sortLabels } = SETS[kind];
    // The untyped kinds offer today's list as it is, same object.
    const list: SortOption[] =
      sort === ALL_SORT_KEYS
        ? sortOptions
        : sort.map((key) => ({
            key,
            value: sortLabels?.[key] ?? label(key),
          }));
    return [kind, list];
  }),
) as Record<LibraryKind, SortOption[]>;

/** The sort choices a library of this kind offers, Default first. */
export const sortOptionsFor = (kind: LibraryKind): SortOption[] =>
  SORT_OPTIONS[kind] ?? SORT_OPTIONS.mixed;

export const filterGroupsFor = (kind: LibraryKind): readonly FilterGroupKey[] =>
  libraryFilterSetFor(kind).groups;

export const filterByOptionsFor = (
  kind: LibraryKind,
): readonly FilterByOption[] => libraryFilterSetFor(kind).filterBy;

export interface FilterValues {
  genres: string[];
  officialRatings: string[];
  years: string[];
  tags: string[];
  audioLanguages: string[];
  subtitleLanguages: string[];
  filterBy: string[];
}

const VALUE_KEY: Record<FilterGroupKey, keyof FilterValues> = {
  genres: "genres",
  years: "years",
  tags: "tags",
  officialRatings: "officialRatings",
  audioLanguages: "audioLanguages",
  subtitleLanguages: "subtitleLanguages",
  filterBy: "filterBy",
};

/**
 * The filter values with the groups this kind hides emptied. A selection saved
 * in another kind of library (or before a group was hidden) must not filter
 * what the page gives no way to see or undo. The same object comes back when
 * nothing needs dropping, so a memo keyed on it stays put.
 */
export const pruneFilters = <T extends FilterValues>(
  kind: LibraryKind,
  filters: T,
): T => {
  const shown = new Set(filterGroupsFor(kind));
  let pruned: T | null = null;
  for (const group of Object.keys(VALUE_KEY) as FilterGroupKey[]) {
    const key = VALUE_KEY[group];
    if (shown.has(group) || filters[key].length === 0) continue;
    pruned ??= { ...filters };
    (pruned[key] as string[]) = [];
  }
  return pruned ?? filters;
};

/**
 * What a page of this kind acts on, given the selection it holds: the sort
 * the shown list has (Name otherwise) and only the visible filter groups. The
 * saved preference is never touched, so the choice comes back in a library
 * that offers it.
 */
export const effectiveSelection = <
  T extends FilterValues & { sortBy: SortByOption[] },
>(
  kind: LibraryKind,
  selection: T,
): T => {
  const pruned = pruneFilters(kind, selection);
  const sortBy = resolveSortKey(selection.sortBy[0], sortOptionsFor(kind));
  return sortBy === selection.sortBy[0]
    ? pruned
    : { ...pruned, sortBy: [sortBy] };
};
