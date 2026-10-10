import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useMemo, useState } from "react";
import {
  audioLanguageFilterAtom,
  type FilterByOption,
  filterByAtom,
  filterOwnerAtom,
  genreFilterAtom,
  type SortByOption,
  type SortOrderOption,
  sortByAtom,
  sortOrderAtom,
  subtitleLanguageFilterAtom,
  tagsFilterAtom,
  yearFilterAtom,
} from "@/utils/atoms/filters";

export interface LibraryFilters {
  genres: string[];
  years: string[];
  tags: string[];
  audioLanguages: string[];
  subtitleLanguages: string[];
  sortBy: SortByOption[];
  sortOrder: SortOrderOption[];
  filterBy: FilterByOption[];
}

/**
 * The filters a library or collection screen queries with, or null while it
 * has none of its own yet.
 *
 * The filter atoms are global, and a screen only writes its selection into
 * them in its focus effect. Read directly, they hand a screen whatever was
 * there before that effect ran: the atoms' initial values on the first library
 * of a session, the previous library's genres, years and sort after that. The
 * screen queried with those, then again with its own a moment later, so every
 * library opened cost the server two item queries, one of them for another
 * library's filters. The same happened to a library left mounted under the
 * one opened on top of it.
 *
 * So the atoms are only followed while filterOwnerAtom names this screen. When
 * another screen takes them over, the last selection this one held is kept.
 *
 * The screen puts its name there itself, in the focus effect that writes its
 * selection. It comes off again here when the screen unmounts: a later visit
 * to the same library is a new screen with the same id, and has to wait for
 * its own focus effect like any other.
 */
export const useLibraryFilters = (screenId: string): LibraryFilters | null => {
  const owner = useAtomValue(filterOwnerAtom);
  const setOwner = useSetAtom(filterOwnerAtom);
  const genres = useAtomValue(genreFilterAtom);
  const years = useAtomValue(yearFilterAtom);
  const tags = useAtomValue(tagsFilterAtom);
  const audioLanguages = useAtomValue(audioLanguageFilterAtom);
  const subtitleLanguages = useAtomValue(subtitleLanguageFilterAtom);
  const sortBy = useAtomValue(sortByAtom);
  const sortOrder = useAtomValue(sortOrderAtom);
  const filterBy = useAtomValue(filterByAtom);

  const shared = useMemo(
    () => ({
      genres,
      years,
      tags,
      audioLanguages,
      subtitleLanguages,
      sortBy,
      sortOrder,
      filterBy,
    }),
    [
      genres,
      years,
      tags,
      audioLanguages,
      subtitleLanguages,
      sortBy,
      sortOrder,
      filterBy,
    ],
  );

  const [own, setOwn] = useState<{
    screenId: string;
    filters: LibraryFilters;
  } | null>(null);

  useEffect(
    () => () =>
      // Only its own name: by now another screen may hold the atoms.
      setOwner((current) => (current === screenId ? null : current)),
    [screenId, setOwner],
  );

  // Set while rendering rather than in an effect: an effect would leave one
  // render where the screen holds the atoms and still queries with the
  // selection it kept from before.
  if (owner === screenId) {
    if (own?.screenId !== screenId || own.filters !== shared) {
      setOwn({ screenId, filters: shared });
    }
    return shared;
  }

  return own?.screenId === screenId ? own.filters : null;
};
