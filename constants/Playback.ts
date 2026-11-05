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

/**
 * How often, in ms, the stats overlay asks the server how far its transcode
 * has come. The player's own numbers refresh faster, but these cost a request
 * to /Sessions each time and move slowly.
 */
export const TRANSCODE_PROGRESS_POLL_INTERVAL = 5_000;

/**
 * Media time left when the next-episode countdown starts, in both players.
 * The JS countdown fill spans the same window, and the "Still watching?"
 * decision is taken once it opens.
 */
export const NEXT_EPISODE_COUNTDOWN_MS = 10_000;

/**
 * Longest one playback report may hold the native player's report queue, in
 * ms. Reports go out one at a time so the server sees them in order, and the
 * SDK client has no timeout of its own: without this, one request that never
 * settles would hold every later report, the Stop included.
 */
export const PLAYBACK_REPORT_TIMEOUT_MS = 15_000;

export type Bitrate = {
  key: string;
  value: number | undefined;
};

/**
 * The playback qualities offered, highest first: the item page's, the default one's, and the remote
 * playback quality's, which a receiver plays at. "Max" caps nothing.
 */
export const BITRATES: Bitrate[] = [
  {
    key: "Max",
    value: undefined,
  },
  {
    key: "8 Mb/s",
    value: 8000000,
    height: 1080,
  },
  {
    key: "4 Mb/s",
    value: 4000000,
    height: 1080,
  },
  {
    key: "2 Mb/s",
    value: 2000000,
  },
  {
    key: "1 Mb/s",
    value: 1000000,
  },
  {
    key: "500 Kb/s",
    value: 500000,
  },
  {
    key: "250 Kb/s",
    value: 250000,
  },
].sort(
  (a, b) =>
    (b.value || Number.POSITIVE_INFINITY) -
    (a.value || Number.POSITIVE_INFINITY),
);
