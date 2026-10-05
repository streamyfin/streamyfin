import type { PersonKind } from "@jellyfin/sdk/lib/generated-client/models";

/** How many results each section of the library search shows. */
export const SEARCH_RESULT_LIMIT = 10;

/**
 * How many people a search asks for before keeping the best matches. The
 * Persons API answers in name order at best, not by relevance, so the first
 * few of a short search are rarely the ones meant. Jellyfin Web asks for as
 * many.
 */
export const SEARCH_PEOPLE_FETCH_LIMIT = 100;

/**
 * Person types the People section leaves out, as Jellyfin Web does. A music
 * library registers every artist as a person, so without this a search for an
 * actor lists musicians too; those already have the Artists section.
 */
export const SEARCH_EXCLUDED_PERSON_TYPES: PersonKind[] = [
  "Artist",
  "AlbumArtist",
];

/**
 * How many of a studio's titles one page asks for. The TV mounts every poster
 * of its grid at once and shows more of them per screen, so it asks for more.
 */
export const STUDIO_PAGE_SIZE = 18;
export const STUDIO_TV_PAGE_SIZE = 36;
