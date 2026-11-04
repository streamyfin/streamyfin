/**
 * How long a server whose plugin answered 404 for the resolved settings, then served its
 * stored configuration, is not asked for them again. An administrator who updates the
 * plugin while the app runs gets the resolved settings within this, and each refresh
 * before it saves the request that would fail.
 */
export const RESOLVED_SETTINGS_RETRY_MS = 60 * 60 * 1000;
