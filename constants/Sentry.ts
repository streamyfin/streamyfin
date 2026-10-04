/**
 * The application identifiers of the builds this project ships: the iOS and
 * tvOS bundle identifier and the Android application id, as app.json has them
 * (constants/Sentry.test.ts pins the two together).
 *
 * Written down here rather than read from the config at runtime on purpose: a
 * fork renames the app in app.json, so the embedded config of a fork's build
 * names the fork. Only a value the rename does not touch can tell a fork, or a
 * build re-signed under another identifier, from the real thing.
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
 * report.
 */
export const HTTP_FAILURE_STORM_WINDOW_MS = 2 * 60_000;

/**
 * How long a Seerr route that failed with some status stays out of the local
 * error log. The response interceptor runs once per axios attempt, and React
 * Query retries a failing request three times.
 */
export const SEERR_REPORT_THROTTLE_MS = 60_000;
