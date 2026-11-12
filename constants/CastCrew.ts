import type { PersonKind } from "@jellyfin/sdk/lib/generated-client/models";

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

/**
 * Who counts as cast for the "More with" rows of an item page: actors, and an
 * episode's guest stars, who are its cast. Crew is left out, so a director
 * never takes one of the rows from an actor.
 */
export const CAST_KINDS: readonly PersonKind[] = ["Actor", "GuestStar"];

/** Who the TV cast cards and the TV cast line show. */
export const TV_CAST_KINDS: readonly PersonKind[] = ["Actor"];
