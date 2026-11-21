import type { PersonKind } from "@jellyfin/sdk/lib/generated-client/models";

/**
 * How many results each section of the library search shows. Ten made every
 * section a single sideways rail with no way to see more: on a library with
 * thousands of films a descriptive search has far more good answers than that.
 */
export const SEARCH_RESULT_LIMIT = 30;

/**
 * How long typing has to pause before the search is run. Each run is a dozen
 * recursive requests to the server, so a short window means most of them are
 * aborted by the next keystroke before they answer, and the last one can lose
 * that race and leave the screen empty.
 */
export const SEARCH_DEBOUNCE_MS = 400;

/**
 * How many people a search asks for before keeping the best matches. The
 * Persons API answers in name order at best, not by relevance, so the first
 * few of a short search are rarely the ones meant. Jellyfin Web asks for as
 * many.
 */
export const SEARCH_PEOPLE_FETCH_LIMIT = 100;

/**
 * How many people a search asks for once more when its first answer came back
 * full. A full answer was cut off somewhere along the alphabet, and the best
 * match can lie past the cut: on a large library "Tom Hanks" sorts after a
 * hundred names that merely contain "tom". Ten times the first ask covers
 * that without making every search carry it.
 */
export const SEARCH_PEOPLE_WIDE_FETCH_LIMIT = 1000;

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
