/**
 * The application identifiers of the builds this project ships: the iOS and
 * tvOS bundle identifier and the Android application id, as app.json has them
 * (constants/Sentry.test.ts pins the two together).
 *
 * Written down here rather than read from the config at runtime on purpose: a
 * fork renames the app in app.json, so the embedded config of a fork's build
 * names the fork. Only a value the rename does not touch can tell a fork from
 * the real thing.
 *
 * A build re-signed for sideloading keeps the identifier and gains a suffix
 * (utils/sentry.ts `applicationIdKind`), so it is still told by this list.
 */
export const OFFICIAL_APPLICATION_IDS: readonly string[] = [
  "com.fredrikburmester.streamyfin",
];

/**
 * How many distinct failures one session remembers having reported. Past the
 * cap a new failure is reported without being remembered, so a session that
 * somehow produces this many distinct failures loses the dedupe, not the
 * reports.
 */
export const MAX_SESSION_REPORT_KEYS = 200;

/**
 * After a backend's failure with some status is reported, other routes of the
 * same backend failing with that same status stay quiet for this long: a
 * server having a bad minute fails every in-flight request at once, and each
 * one would otherwise open its own issue. Long enough to cover React Query's
 * retries and the handful of screens a user opens while it lasts, short
 * enough that a different failure later in the session is still its own
 * report. Only for the statuses a whole server can answer with, see
 * SERVER_WIDE_CLIENT_STATUSES.
 */
export const HTTP_FAILURE_STORM_WINDOW_MS = 2 * 60_000;

/**
 * The 4xx statuses that can be a whole server's answer rather than one
 * request's, and so count towards a failure storm next to every 5xx: a
 * session that ended (401), a refusal of the user or of where they are (403)
 * and a rate limit (429) meet every route alike.
 *
 * The rest of the 4xx are left out on purpose. A 400, a 404 or a 409 answers
 * the one request that got it, so a second route failing that way is a second
 * failure, and it is what a bug in the app looks like: one harmless 404 must
 * not be what hides it.
 */
export const SERVER_WIDE_CLIENT_STATUSES: readonly number[] = [401, 403, 429];

/**
 * How long a Seerr route that failed with some status stays out of the local
 * error log. The response interceptor runs once per axios attempt, and React
 * Query retries a failing request three times.
 */
export const SEERR_REPORT_THROTTLE_MS = 60_000;

/**
 * What stands in for the address of the user's server in anything that
 * leaves the app. One spelling, so that a search of Sentry for redacted
 * hosts finds all of them.
 */
export const REDACTED_SERVER = "[server]";
