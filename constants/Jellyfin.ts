/** What a Jellyfin server calls itself in its public system info. */
export const JELLYFIN_PRODUCT_NAME = "Jellyfin Server";

/**
 * The two ways an item id is written: the 32 hex digits the server sends every
 * id as, or the same GUID with its dashes. The server binds an id parameter as
 * a GUID and answers anything else with a 400 before looking it up. A pattern
 * source, so each caller anchors it and adds its own alternatives.
 */
export const JELLYFIN_ID_PATTERN =
  "[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/**
 * How long the public server info (version, id) is trusted before it is asked
 * for again. A server changes version a few times a year, and this bounds how
 * long a feature gated on the version lags behind an upgrade.
 */
export const SERVER_INFO_STALE_TIME_MS = 12 * 60 * 60 * 1000;
