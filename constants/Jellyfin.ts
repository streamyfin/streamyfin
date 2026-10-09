/** What a Jellyfin server calls itself in its public system info. */
export const JELLYFIN_PRODUCT_NAME = "Jellyfin Server";

/**
 * How long the public server info (version, id) is trusted before it is asked
 * for again. A server changes version a few times a year, and this bounds how
 * long a feature gated on the version lags behind an upgrade.
 */
export const SERVER_INFO_STALE_TIME_MS = 12 * 60 * 60 * 1000;
