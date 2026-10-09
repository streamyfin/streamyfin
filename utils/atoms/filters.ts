import {
  type CollectionType,
  ItemFilter,
} from "@jellyfin/sdk/lib/generated-client/models";
import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { useMemo } from "react";
import { storage } from "../mmkv";
import { useSettings } from "./settings";

export enum SortByOption {
  Default = "Default",
  SortName = "SortName",
  CommunityRating = "CommunityRating",
  CriticRating = "CriticRating",
  DateCreated = "DateCreated",
  DateLastContentAdded = "DateLastContentAdded",
  DatePlayed = "DatePlayed",
  PlayCount = "PlayCount",
  ProductionYear = "ProductionYear",
  Runtime = "Runtime",
  OfficialRating = "OfficialRating",
  PremiereDate = "PremiereDate",
  StartDate = "StartDate",
  AirTime = "AirTime",
  Studio = "Studio",
  IndexNumber = "IndexNumber",
  Random = "Random",
}
// These go to the server as they are, so each one is the SDK's own ItemFilter
// constant: a name the server does not have no longer compiles.
export const FilterByOption = {
  IsFavoriteOrLikes: ItemFilter.IsFavoriteOrLikes,
  IsUnplayed: ItemFilter.IsUnplayed,
  IsPlayed: ItemFilter.IsPlayed,
  Likes: ItemFilter.Likes,
  IsFavorite: ItemFilter.IsFavorite,
  IsResumable: ItemFilter.IsResumable,
} as const satisfies Record<string, ItemFilter>;
export type FilterByOption =
  (typeof FilterByOption)[keyof typeof FilterByOption];

// How the favourite-or-liked filter was spelt until the server's name replaced
// it. Per-library preferences saved before that still hold it.
const LEGACY_IS_FAVORITE_OR_LIKES = "IsFavoriteOrLiked";

export enum SortOrderOption {
  Ascending = "Ascending",
  Descending = "Descending",
}

type SortOption = {
  key: SortByOption;
  value: string;
};

export const sortOptions: SortOption[] = [
  { key: SortByOption.Default, value: "Default" },
  { key: SortByOption.SortName, value: "Name" },
  { key: SortByOption.CommunityRating, value: "Community Rating" },
  { key: SortByOption.CriticRating, value: "Critics Rating" },
  { key: SortByOption.DateCreated, value: "Date Added" },
  { key: SortByOption.DatePlayed, value: "Date Played" },
  { key: SortByOption.PlayCount, value: "Play Count" },
  { key: SortByOption.ProductionYear, value: "Production Year" },
  { key: SortByOption.Runtime, value: "Runtime" },
  { key: SortByOption.OfficialRating, value: "Official Rating" },
  { key: SortByOption.PremiereDate, value: "Premiere Date" },
  { key: SortByOption.StartDate, value: "Start Date" },

  { key: SortByOption.AirTime, value: "Air Time" },
  { key: SortByOption.Studio, value: "Studio" },
  { key: SortByOption.IndexNumber, value: "Index Number" },

  { key: SortByOption.Random, value: "Random" },
];

// The server keeps DateLastContentAdded on containers only, and what it means
// depends on the container. For a playlist it is the last time an item went in,
// which is the one reading the label covers, so the option is offered in
// playlist libraries and nowhere else.
const playlistSortOptions: SortOption[] = sortOptions.flatMap((option) =>
  option.key === SortByOption.DateCreated
    ? [
        option,
        {
          key: SortByOption.DateLastContentAdded,
          value: "Date Playlist Updated",
        },
      ]
    : [option],
);

/**
 * The sort options a library of this type offers. Both lists are built once,
 * so the result is safe to use as a hook dependency.
 */
export const sortOptionsFor = (
  collectionType: CollectionType | null | undefined,
): SortOption[] =>
  collectionType === "playlists" ? playlistSortOptions : sortOptions;

export const useFilterOptions = () => {
  const { settings } = useSettings();
  // Memoized so the array identity stays stable across renders: a fresh array
  // every render invalidates the library screen's ListHeaderComponent callback,
  // which rebuilds the whole filter bar on any unrelated re-render.
  // We only show the watchlist option if someone has ticked that setting.
  return useMemo(
    (): { key: FilterByOption; value: string }[] =>
      settings?.useKefinTweaks
        ? [
            {
              key: FilterByOption.IsFavoriteOrLikes,
              value: "Is Favorite Or Liked",
            },
            { key: FilterByOption.IsUnplayed, value: "Is Unplayed" },
            { key: FilterByOption.IsPlayed, value: "Is Played" },
            { key: FilterByOption.IsFavorite, value: "Is Favorite" },
            { key: FilterByOption.IsResumable, value: "Is Resumable" },
            { key: FilterByOption.Likes, value: "Watchlist" },
          ]
        : [
            {
              key: FilterByOption.IsFavoriteOrLikes,
              value: "Is Favorite Or Liked",
            },
            { key: FilterByOption.IsUnplayed, value: "Is Unplayed" },
            { key: FilterByOption.IsPlayed, value: "Is Played" },
            { key: FilterByOption.IsFavorite, value: "Is Favorite" },
            { key: FilterByOption.IsResumable, value: "Is Resumable" },
          ],
    [settings?.useKefinTweaks],
  );
};

export const sortOrderOptions: {
  key: SortOrderOption;
  value: string;
}[] = [
  { key: SortOrderOption.Ascending, value: "Ascending" },
  { key: SortOrderOption.Descending, value: "Descending" },
];

export const genreFilterAtom = atom<string[]>([]);
export const tagsFilterAtom = atom<string[]>([]);
export const yearFilterAtom = atom<string[]>([]);
// Language tags as Filters2 reports them, not display names (Jellyfin 12+).
export const audioLanguageFilterAtom = atom<string[]>([]);
export const subtitleLanguageFilterAtom = atom<string[]>([]);
export const sortByAtom = atom<SortByOption[]>([SortByOption.Default]);
export const sortOrderAtom = atom<SortOrderOption[]>([
  SortOrderOption.Ascending,
]);
export const filterByAtom = atom<FilterByOption[]>([]);

// The six atoms above are shared by every library and collection screen, and
// the stack keeps several of those mounted at once. This names the screen
// whose selection they hold right now: a screen writes its id here together
// with its filters, and reads them back through useLibraryFilters, which hands
// them out to that screen only.
export const filterOwnerAtom = atom<string | null>(null);

export interface SortPreference {
  [libraryId: string]: SortByOption;
}

export interface SortOrderPreference {
  [libraryId: string]: SortOrderOption;
}

export interface FilterPreference {
  [libraryId: string]: FilterByOption;
}

// Genres, years, tags and the two language filters are multi-select, so each
// library remembers a list.
export interface MultiFilterPreference {
  [libraryId: string]: string[];
}

const defaultSortPreference: SortPreference = {};
const defaultSortOrderPreference: SortOrderPreference = {};
const defaultFilterPreference: FilterPreference = {};
const defaultMultiFilterPreference: MultiFilterPreference = {};

// Every preference map below persists the same way: one JSON blob per key.
const mmkvStorage = <T>() => ({
  getItem: (key: string, initialValue: T): T => {
    const value = storage.getString(key);
    if (!value) return initialValue;
    try {
      return JSON.parse(value) as T;
    } catch {
      return initialValue;
    }
  },
  setItem: (key: string, value: T) => {
    storage.set(key, JSON.stringify(value));
  },
  removeItem: (key: string) => {
    storage.remove(key);
  },
});

export const sortByPreferenceAtom = atomWithStorage<SortPreference>(
  "sortByPreference",
  defaultSortPreference,
  mmkvStorage<SortPreference>(),
);

// Renames the legacy spelling as the map is read, so every reader gets a
// filter the server accepts and the next save writes the fixed name back.
const filterPreferenceStorage = () => {
  const base = mmkvStorage<FilterPreference>();
  return {
    ...base,
    getItem: (key: string, initialValue: FilterPreference) => {
      const stored: Record<string, string> = base.getItem(key, initialValue);
      const migrated: FilterPreference = {};
      for (const [libraryId, filter] of Object.entries(stored ?? {})) {
        migrated[libraryId] = (
          filter === LEGACY_IS_FAVORITE_OR_LIKES
            ? FilterByOption.IsFavoriteOrLikes
            : filter
        ) as FilterByOption;
      }
      return migrated;
    },
  };
};

export const FilterByPreferenceAtom = atomWithStorage<FilterPreference>(
  "filterByPreference",
  defaultFilterPreference,
  filterPreferenceStorage(),
);

export const sortOrderPreferenceAtom = atomWithStorage<SortOrderPreference>(
  "sortOrderPreference",
  defaultSortOrderPreference,
  mmkvStorage<SortOrderPreference>(),
);

export const genrePreferenceAtom = atomWithStorage<MultiFilterPreference>(
  "genrePreference",
  defaultMultiFilterPreference,
  mmkvStorage<MultiFilterPreference>(),
);

export const yearPreferenceAtom = atomWithStorage<MultiFilterPreference>(
  "yearPreference",
  defaultMultiFilterPreference,
  mmkvStorage<MultiFilterPreference>(),
);

export const tagPreferenceAtom = atomWithStorage<MultiFilterPreference>(
  "tagPreference",
  defaultMultiFilterPreference,
  mmkvStorage<MultiFilterPreference>(),
);

export const audioLanguagePreferenceAtom =
  atomWithStorage<MultiFilterPreference>(
    "audioLanguagePreference",
    defaultMultiFilterPreference,
    mmkvStorage<MultiFilterPreference>(),
  );

export const subtitleLanguagePreferenceAtom =
  atomWithStorage<MultiFilterPreference>(
    "subtitleLanguagePreference",
    defaultMultiFilterPreference,
    mmkvStorage<MultiFilterPreference>(),
  );

export const getSortByPreference = (
  libraryId: string,
  preferences: SortPreference,
) => {
  return preferences?.[libraryId] || null;
};

export const getSortOrderPreference = (
  libraryId: string,
  preferences: SortOrderPreference,
) => {
  return preferences?.[libraryId] || null;
};

export const getFilterByPreference = (
  libraryId: string,
  preferences: FilterPreference,
) => {
  return preferences?.[libraryId] || null;
};

export const getMultiFilterPreference = (
  libraryId: string,
  preferences: MultiFilterPreference,
) => preferences?.[libraryId] ?? [];
