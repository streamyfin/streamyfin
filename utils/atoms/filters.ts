import AsyncStorage from "@react-native-async-storage/async-storage";
import { atom } from "jotai";
import { atomWithStorage, createJSONStorage } from "jotai/utils";

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
  IsUnplayed = "IsUnplayed",
  IsPlayed = "IsPlayed",
  AirTime = "AirTime",
  Studio = "Studio",
  IsFavoriteOrLiked = "IsFavoriteOrLiked",
  Random = "Random",
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
  { key: SortByOption.IsUnplayed, value: "Is Unplayed" },
  { key: SortByOption.IsPlayed, value: "Is Played" },
  { key: SortByOption.AirTime, value: "Air Time" },
  { key: SortByOption.Studio, value: "Studio" },
  { key: SortByOption.IsFavoriteOrLiked, value: "Is Favorite Or Liked" },
  { key: SortByOption.Random, value: "Random" },
];

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

/**
 * Sort preferences with persistence
 */
export interface SortPreference {
  [libraryId: string]: SortByOption;
}

export interface SortOrderPreference {
  [libraryId: string]: SortOrderOption;
}

const defaultSortPreference: SortPreference = {};
const defaultSortOrderPreference: SortOrderPreference = {};

export const sortByPreferenceAtom = atomWithStorage<SortPreference>(
  "sortByPreference",
  defaultSortPreference,
  {
    getItem: async (key) => {
      const value = await AsyncStorage.getItem(key);
      return value ? JSON.parse(value) : null;
    },
    setItem: async (key, value) => {
      await AsyncStorage.setItem(key, JSON.stringify(value));
    },
    removeItem: async (key) => {
      await AsyncStorage.removeItem(key);
    },
  }
);

export const sortOrderPreferenceAtom = atomWithStorage<SortOrderPreference>(
  "sortOrderPreference",
  defaultSortOrderPreference,
  {
    getItem: async (key) => {
      const value = await AsyncStorage.getItem(key);
      return value ? JSON.parse(value) : null;
    },
    setItem: async (key, value) => {
      await AsyncStorage.setItem(key, JSON.stringify(value));
    },
    removeItem: async (key) => {
      await AsyncStorage.removeItem(key);
    },
  }
);

// Helper functions to get and set sort preferences
export const getSortByPreference = (
  libraryId: string,
  preferences: SortPreference
) => {
  return preferences?.[libraryId] || null;
};

export const getSortOrderPreference = (
  libraryId: string,
  preferences: SortOrderPreference
) => {
  return preferences?.[libraryId] || null;
};

