/** What a Jellyfin server calls itself in its public system info. */
export const JELLYFIN_PRODUCT_NAME = "Jellyfin Server";

// A GUID written with its dashes, which the bracketed forms wrap.
const DASHED_GUID =
  "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/**
 * The two ways the server writes an item id: the 32 hex digits it sends every
 * id as, or the same GUID with its dashes. The app's request paths carry ids
 * written this way. A pattern source to match without case, grouped so that a
 * caller can anchor it or add its own alternatives by concatenation.
 */
export const JELLYFIN_ID_PATTERN = `(?:[0-9a-f]{32}|${DASHED_GUID})`;

/**
 * The forms the server reads an id parameter in, in a path or a query.
 * Jellyfin binds one the way .NET's Guid.TryParse reads a GUID: besides the
 * two above, it takes the dashed form in braces or in parentheses, and it
 * ignores whitespace around any of them, which the caller trims before
 * matching. A value that does not read as a GUID gets a 400 before anything
 * is looked up. TryParse also reads a hex literal form, {0x...,{0x...}}, that
 * nothing writes an id in, and this pattern leaves it out. Grouped, like
 * JELLYFIN_ID_PATTERN.
 */
export const JELLYFIN_ID_PARAMETER_PATTERN = `(?:${JELLYFIN_ID_PATTERN}|\\{${DASHED_GUID}\\}|\\(${DASHED_GUID}\\))`;

/**
 * How long the public server info (version, id) is trusted before it is asked
 * for again. A server changes version a few times a year, and this bounds how
 * long a feature gated on the version lags behind an upgrade.
 */
export const SERVER_INFO_STALE_TIME_MS = 12 * 60 * 60 * 1000;
