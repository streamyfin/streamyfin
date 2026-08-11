import { useAtom } from "jotai";
import { useCallback } from "react";
import {
  FilterByPreferenceAtom,
  filterByAtom,
  genreFilterAtom,
  genrePreferenceAtom,
  SortByOption,
  SortOrderOption,
  sortByAtom,
  sortByPreferenceAtom,
  sortOrderAtom,
  sortOrderPreferenceAtom,
  tagPreferenceAtom,
  tagsFilterAtom,
  yearFilterAtom,
  yearPreferenceAtom,
} from "@/utils/atoms/filters";

/**
 * Single source of truth for the library filter bar's reset action and its
 * visibility. The mobile ResetFiltersButton and the TV filter header both use
 * this so they can't drift: sort and order used to be reset on neither path, so
 * the reset (X) never reflected a changed sort.
 *
 * A reset clears the active filters AND the library's saved preferences (sort,
 * order, filterBy, genres, years, tags); otherwise the stored preference
 * resurfaces when the screen's mount effect re-applies it on the next entry.
 */
export const useFilterReset = (libraryId: string) => {
  const [selectedGenres, setSelectedGenres] = useAtom(genreFilterAtom);
  const [selectedYears, setSelectedYears] = useAtom(yearFilterAtom);
  const [selectedTags, setSelectedTags] = useAtom(tagsFilterAtom);
  const [filterBy, setFilterBy] = useAtom(filterByAtom);
  const [sortBy, setSortBy] = useAtom(sortByAtom);
  const [sortOrder, setSortOrder] = useAtom(sortOrderAtom);
  const [, setSortByPreference] = useAtom(sortByPreferenceAtom);
  const [, setSortOrderPreference] = useAtom(sortOrderPreferenceAtom);
  const [, setFilterByPreference] = useAtom(FilterByPreferenceAtom);
  const [, setGenrePreference] = useAtom(genrePreferenceAtom);
  const [, setYearPreference] = useAtom(yearPreferenceAtom);
  const [, setTagPreference] = useAtom(tagPreferenceAtom);

  // SortName / Ascending is the baseline a library opens with (the mount-effect
  // fallback), so any other value counts as an active, resettable sort.
  const hasActiveFilters =
    selectedGenres.length > 0 ||
    selectedYears.length > 0 ||
    selectedTags.length > 0 ||
    filterBy.length > 0 ||
    sortBy[0] !== SortByOption.SortName ||
    sortOrder[0] !== SortOrderOption.Ascending;

  const resetAllFilters = useCallback(() => {
    setSelectedGenres([]);
    setSelectedYears([]);
    setSelectedTags([]);
    setFilterBy([]);
    setSortBy([SortByOption.SortName]);
    setSortOrder([SortOrderOption.Ascending]);

    const forget = <T extends Record<string, unknown>>(prev: T): T => {
      const next = { ...prev };
      delete next[libraryId];
      return next;
    };

    setSortByPreference(forget);
    setSortOrderPreference(forget);
    setFilterByPreference(forget);
    setGenrePreference(forget);
    setYearPreference(forget);
    setTagPreference(forget);
  }, [
    libraryId,
    setSelectedGenres,
    setSelectedYears,
    setSelectedTags,
    setFilterBy,
    setSortBy,
    setSortOrder,
    setSortByPreference,
    setSortOrderPreference,
    setFilterByPreference,
    setGenrePreference,
    setYearPreference,
    setTagPreference,
  ]);

  return { hasActiveFilters, resetAllFilters };
};
