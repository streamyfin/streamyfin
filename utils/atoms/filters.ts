import { atom } from "jotai";
import { useMemo } from "react";
import { useSettings } from "./settings";

export enum SortByOption {
  Default = "Default",
  SortName = "SortName",
  CommunityRating = "CommunityRating",
  CriticRating = "CriticRating",
  DateCreated = "DateCreated",
  DatePlayed = "DatePlayed",
  PlayCount = "PlayCount",
  ProductionYear = "ProductionYear",
  Runtime = "Runtime",
  OfficialRating = "OfficialRating",
  PremiereDate = "PremiereDate",
  StartDate = "StartDate",
  AirTime = "AirTime",
  Studio = "Studio",
  Random = "Random",
}
export enum FilterByOption {
  IsFavoriteOrLiked = "IsFavoriteOrLiked",
  IsUnplayed = "IsUnplayed",
  IsPlayed = "IsPlayed",
  Likes = "Likes",
  IsFavorite = "IsFavorite",
  IsResumable = "IsResumable",
}

export enum SortOrderOption {
  Ascending = "Ascending",
  Descending = "Descending",
}

export const sortOptions: {
  key: SortByOption;
  value: string;
}[] = [
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

  { key: SortByOption.Random, value: "Random" },
];

export const useFilterOptions = () => {
  const { settings } = useSettings();
  // Memoized so the array identity stays stable across renders. A fresh array
  // each render cascades into ListHeaderComponent re-creation and, under heavy
  // re-rendering (active downloads), trips React's max-update-depth guard.
  // We only show the watchlist option if someone has ticked that setting.
  return useMemo(
    () =>
      settings?.useKefinTweaks
        ? [
            {
              key: FilterByOption.IsFavoriteOrLiked,
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
              key: FilterByOption.IsFavoriteOrLiked,
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
export const sortByAtom = atom<SortByOption[]>([SortByOption.Default]);
export const sortOrderAtom = atom<SortOrderOption[]>([
  SortOrderOption.Ascending,
]);
export const filterByAtom = atom<FilterByOption[]>([]);

export interface SortPreference {
  [libraryId: string]: SortByOption;
}

export interface SortOrderPreference {
  [libraryId: string]: SortOrderOption;
}

export interface FilterPreference {
  [libraryId: string]: FilterByOption;
}

const defaultSortPreference: SortPreference = {};
const defaultSortOrderPreference: SortOrderPreference = {};
const defaultFilterPreference: FilterPreference = {};

// Per-library filter memory is intentionally in-memory (NOT atomWithStorage):
// each library keeps its own filters for the session, and everything resets
// when the app is fully closed.
export const sortByPreferenceAtom = atom<SortPreference>(defaultSortPreference);

export const FilterByPreferenceAtom = atom<FilterPreference>(
  defaultFilterPreference,
);

export const sortOrderPreferenceAtom = atom<SortOrderPreference>(
  defaultSortOrderPreference,
);

// Genres / years / tags are multi-select, so each library remembers an array.
export interface MultiFilterPreference {
  [libraryId: string]: string[];
}

export const genrePreferenceAtom = atom<MultiFilterPreference>({});
export const yearPreferenceAtom = atom<MultiFilterPreference>({});
export const tagPreferenceAtom = atom<MultiFilterPreference>({});

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
