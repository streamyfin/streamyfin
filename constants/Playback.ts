/**
 * Heartbeat cadence, in ms, for the periodic playback progress report. The
 * players tick once a second, but the server only needs the position often
 * enough for Now Playing and resume: pause, resume and seeks report on their
 * own in both players, and the JS player also reports track and mute changes
 * at once. Shared by the JS and native players so the server sees one cadence.
 */
export const PROGRESS_REPORT_INTERVAL = 10_000;

/**
 * Longest one playback report may hold the native player's report queue, in
 * ms. Reports go out one at a time so the server sees them in order, and the
 * SDK client has no timeout of its own: without this, one request that never
 * settles would hold every later report, the Stop included.
 */
export const PLAYBACK_REPORT_TIMEOUT_MS = 15_000;
