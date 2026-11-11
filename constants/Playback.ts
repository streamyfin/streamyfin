/**
 * Heartbeat cadence, in ms, for the periodic playback progress report. The
 * players tick once a second, but the server only needs the position often
 * enough for Now Playing and resume: pause, resume and seeks report on their
 * own in the video player. Shared with the music player so the server sees
 * one cadence.
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

/**
 * Media time left when the next-episode countdown starts. The "Still
 * watching?" decision is taken once it opens.
 */
export const NEXT_EPISODE_COUNTDOWN_MS = 10_000;

/**
 * Longest one playback report may hold the native player's report queue, in
 * ms. Reports go out one at a time so the server sees them in order, and the
 * SDK client has no timeout of its own: without this, one request that never
 * settles would hold every later report, the Stop included.
 */
export const PLAYBACK_REPORT_TIMEOUT_MS = 15_000;

/**
 * How long, in ms, a new native player waits for one that is closing to be
 * gone. iOS refuses to present a player until the previous one's
 * cross-dissolve has ended, a few hundred ms after it emitted onDismiss, and
 * a play request can land in between (Sentry REACT-NATIVE-BR). Past this,
 * the present goes ahead and its refusal is reported.
 */
export const NATIVE_PLAYER_CLOSE_WAIT_MS = 2_000;

/** How often, in ms, that wait checks whether the closing player is gone. */
export const NATIVE_PLAYER_CLOSE_POLL_MS = 50;

/**
 * How long the native player may spend fetching an item's sidecar subtitles
 * onto disk before starting playback, in ms, and the cap for one subtitle.
 * A subtitle the engine fetches itself wedges the whole pipeline on a slow
 * path (ExoPlayer #8566), so the player prefetches them; these bound how long
 * that may delay the start and stop one dead sidecar starving the rest. The
 * session's subtitle keeps its remote URL when it misses the budget; any other
 * one is left out until picked, which renegotiates the stream.
 */
export const SUBTITLE_PREFETCH_BUDGET_MS = 6_000;
export const SUBTITLE_PREFETCH_PER_SUBTITLE_MS = 3_000;

/**
 * Where the subtitle prefetch keeps its files under Paths.cache (emptied for
 * every new player), and how long after a cancelled transfer its staging file
 * is swept once more.
 */
export const SUBTITLE_PREFETCH_CACHE_DIR = "subtitles";
export const SUBTITLE_PREFETCH_LATE_SWEEP_MS = 60_000;

/**
 * The query families that show watch progress, refetched after the server's
 * played state changed under them: by a stop report, a pull to refresh, or
 * offline progress being pushed once the connection is back.
 */
export const PLAYBACK_PROGRESS_QUERY_KEYS: readonly (readonly string[])[] = [
  ["item"],
  ["resumeItems"],
  ["continueWatching"],
  ["nextUp-all"],
  ["nextUp"],
  ["episodes"],
  ["seasons"],
  ["home"],
  ["downloadedItems"],
  // A similar-items row shows each poster's watched state, and its list
  // never goes stale by itself.
  ["similarItems"],
];
