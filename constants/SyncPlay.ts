/**
 * SyncPlay policy. Values marked "Jellyfin" mirror the server or Jellyfin Web
 * and should move only when those do, or groups shared with Web clients drift.
 */

const TICKS_PER_SECOND = 10_000_000;

/**
 * Longest a SyncPlay request may hang, in ms. The SDK client has no timeout of
 * its own, and requests run one at a time so the server sees them in the order
 * the user made them: one that never settles would hold every later pause,
 * seek and clock sample behind it.
 */
export const SYNCPLAY_REQUEST_TIMEOUT_MS = 10_000;

/** How long a join waits for the server's GroupJoined before giving up, ms. */
export const SYNCPLAY_JOIN_TIMEOUT_MS = 15_000;

/**
 * How long this client may stay unready before it leaves, in ms. The group
 * waits on every member, so one that cannot load must not hold the others.
 */
export const SYNCPLAY_READY_TIMEOUT_MS = 30_000;

/**
 * Furthest a Ready report may be from the position the group asked for, in
 * ticks. Jellyfin: the server rejects readiness beyond its MaxPlaybackOffset.
 */
export const SYNCPLAY_READY_TOLERANCE_TICKS = TICKS_PER_SECOND / 2;

/**
 * A pause or seek command closer to the decoder than this is not seeked to,
 * in ticks: seeking a paused decoder to where it already is makes it report
 * buffering, which sends the whole group back to waiting.
 */
export const SYNCPLAY_SEEK_TOLERANCE_TICKS = TICKS_PER_SECOND / 10;

/** Clock samples kept; the one with the lowest delay wins. Jellyfin Web. */
export const SYNCPLAY_CLOCK_SAMPLES = 8;
/** Samples taken at the fast interval after joining. Jellyfin Web. */
export const SYNCPLAY_CLOCK_FAST_SAMPLES = 3;
export const SYNCPLAY_CLOCK_FAST_INTERVAL_MS = 1_000;
export const SYNCPLAY_CLOCK_INTERVAL_MS = 60_000;

/** Drift from the group's timeline that is worth a local seek, in ticks. */
export const SYNCPLAY_DRIFT_THRESHOLD_TICKS = TICKS_PER_SECOND * 0.75;
/** No drift check this soon after a command: the decoder is still settling. */
export const SYNCPLAY_DRIFT_GRACE_MS = 1_500;
/** Shortest gap between two drift corrections, in ms. */
export const SYNCPLAY_DRIFT_COOLDOWN_MS = 3_000;

/**
 * How long the native player may report loading before the group hears of
 * it, in ms. mpv reports loading for every seek, including the catch-up seek
 * of a late Unpause, and each Buffering report pauses the whole group.
 */
export const SYNCPLAY_BUFFERING_REPORT_DELAY_MS = 250;

/**
 * How long a group left without the user asking (app in the background, PiP
 * window closed, socket lost) is rejoined on return, in ms. Past it the
 * evening has moved on, and reopening the app should not start a player.
 */
export const SYNCPLAY_RESUME_WINDOW_MS = 30 * 60_000;

/** Layout width of a queue row's poster, in points. */
export const SYNCPLAY_QUEUE_POSTER_WIDTH = 40;

/**
 * Most videos one "add to queue" sends, so a show with hundreds of episodes
 * is one bounded request. Jellyfin Web's own "play all" limit.
 */
export const SYNCPLAY_QUEUE_ADD_LIMIT = 300;

/**
 * How long the TV sheet's route takes to leave the screen, with margin. What
 * opens the player waits this long: a player presented while a modal route
 * is still closing lands under it or not at all.
 */
export const SYNCPLAY_TV_SHEET_DISMISS_MS = 350;
