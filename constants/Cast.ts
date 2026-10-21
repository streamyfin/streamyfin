/**
 * Jellyfin session client name of the official Cast receiver (F007D354). The
 * server keys a session on client + device + user, so a stop reported on the
 * receiver's behalf has to use this exact name.
 */
export const JELLYFIN_RECEIVER_CLIENT = "Chromecast";

/**
 * Most items handed to the receiver in one PlayNow message. Each one is only a
 * few ids, but a Cast message is capped at 64 KB, so a long music queue is sent
 * as a window of this size around the selected track.
 */
export const RECEIVER_MAX_QUEUE_ITEMS = 100;

/**
 * How long a cast waits for the receiver to load the item before telling the
 * user it did not start. A receiver that cannot reach the server fails on its
 * first request without a word back, so this wait is the only sign of it. A
 * receiver measures its bandwidth and runs PlaybackInfo before loading, which
 * takes a few seconds on a home network.
 */
export const RECEIVER_LOAD_TIMEOUT_MS = 30_000;

/**
 * After a Cast session ends on a connection loss, how long to leave the
 * receiver to report its own stop before checking on it.
 */
export const RECEIVER_STOP_GRACE_MS = 3_000;

/**
 * The receiver reports progress every ~5 s while playing, so a session that has
 * not checked in across this window is no longer backed by a running receiver.
 * Three missed reports keeps one late request from reading as a dead TV.
 */
export const RECEIVER_LIVENESS_WINDOW_MS = 15_000;
