/**
 * Jellyfin session client name of the official Cast receiver (F007D354). The
 * server keys a session on client + device + user, so a stop reported on the
 * receiver's behalf has to use this exact name.
 */
export const JELLYFIN_RECEIVER_CLIENT = "Chromecast";

/**
 * How long after a cast starts the phone keeps listening for the receiver's own
 * error messages. The receiver only reports load problems (server unreachable,
 * no playable stream) this way, and they come within seconds of the command.
 */
export const RECEIVER_ERROR_WINDOW_MS = 30_000;

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
