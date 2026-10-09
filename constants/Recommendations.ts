import type { BaseItemKind } from "@jellyfin/sdk/lib/generated-client/models";

/**
 * How many similar items a detail page asks the server for: enough for the
 * row to scroll past the first screen on a phone and on a TV, and the number
 * Jellyfin's own web client asks for.
 */
export const SIMILAR_ITEMS_LIMIT = 12;

/**
 * The kinds of item a similar-items row is drawn for. The server answers for
 * other kinds too (a season gets seasons) and never for an episode; these two
 * are the ones whose answer is worth a row.
 */
export const SIMILAR_ITEMS_SOURCE_TYPES: readonly BaseItemKind[] = [
  "Movie",
  "Series",
];
