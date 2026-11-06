/**
 * Limits for cast and crew on item detail pages. Count distinct people after
 * credits are merged, not the number of credits returned by Jellyfin.
 */

/** Keep the TV text line short when visual cast cards are not shown. */
export const TV_CAST_TEXT_LIMIT = 3;

/** Cap the visual TV cast row instead of showing the entire server cast. */
export const TV_CAST_CARD_LIMIT = 10;

/** Keep actor-specific recommendation rows from overwhelming the item detail page. */
export const MORE_MOVIES_ACTORS_LIMIT = 3;
