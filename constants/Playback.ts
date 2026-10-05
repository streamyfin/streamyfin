/**
 * Heartbeat cadence, in ms, for the periodic playback progress report. The
 * players tick once a second, but the server only needs the position often
 * enough for Now Playing and resume: pause, resume and seeks report on their
 * own in both players, and the JS player also reports track and mute changes
 * at once. Shared by the JS and native players so the server sees one cadence.
 */
export const PROGRESS_REPORT_INTERVAL = 10_000;

/**
 * Most items one Play All or Shuffle on a library page may queue. Every queued
 * item carries its media sources, which the players read to pick the audio
 * and subtitle tracks of the next one, so the request that builds the queue
 * grows with it and playback only starts once it has answered. A hundred
 * titles is several days of video; jellyfin-web stops at 300 with a lighter
 * payload.
 */
export const PLAY_QUEUE_MAX_ITEMS = 100;

/**
 * How long, in ms, the sessions page shows a repeat or shuffle mode it asked
 * another client for before that client has reported it. Two rounds of the
 * 5 s sessions poll: enough for a client that obeys to say so, and short
 * enough that one ignoring the command does not keep a state it never had.
 */
export const REMOTE_MODE_CONFIRM_TIMEOUT = 10_000;
