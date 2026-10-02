/**
 * Heartbeat cadence, in ms, for the periodic playback progress report. The
 * players tick once a second, but the server only needs the position often
 * enough for Now Playing and resume: pause, resume and seeks report on their
 * own in both players, and the JS player also reports track and mute changes
 * at once. Shared by the JS and native players so the server sees one cadence.
 */
export const PROGRESS_REPORT_INTERVAL = 10_000;

/** Account-scoped audio/subtitle identities; unscoped legacy caches are not imported. */
export const TRACK_MEMORY_STORAGE_KEY = "trackSelectionMemory.v2";

/** Bound each remembered-track cache to its most recently changed entries. */
export const TRACK_MEMORY_MAX_ENTRIES = 100;

/** Minimum evidence for carrying a track selection to another file. */
export const STREAM_MATCH_MIN_SCORE = 3;

/** Identity evidence; a subtitle title outweighs codec and position together. */
export const STREAM_MATCH_SCORES = {
  codec: 1,
  position: 1,
  displayTitle: 2,
  audioLanguage: 3,
  audioTitle: 12,
  audioChannels: 4,
  audioChannelLayout: 2,
  audioProfile: 1,
  subtitleLanguage: 3,
  subtitleTitle: 5,
  forced: 2,
  hearingImpaired: 1,
  external: 1,
};
