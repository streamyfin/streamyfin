/**
 * Audiobook player policy. The player runs on the same native audio player as
 * music (react-native-track-player), see providers/AudiobookPlayerProvider.tsx.
 */

/** The skip back intervals the settings offer, in seconds. */
export const AUDIOBOOK_SKIP_BACK_OPTIONS = [5, 10, 15, 30, 45, 60] as const;

/** The skip forward intervals the settings offer, in seconds. */
// Each has its own numbered icon (MaterialCommunityIcons rewind-N, fast-forward-N).
export const AUDIOBOOK_SKIP_FORWARD_OPTIONS = [5, 10, 15, 30, 45, 60] as const;

/** What most audiobook players start with: back a sentence, forward a page. */
export const DEFAULT_AUDIOBOOK_SKIP_BACK_SECONDS = 15;
export const DEFAULT_AUDIOBOOK_SKIP_FORWARD_SECONDS = 30;

/** The playback speeds offered in the player and in the settings. */
export const AUDIOBOOK_PLAYBACK_RATES = [
  0.5, 0.75, 0.9, 1, 1.1, 1.2, 1.25, 1.3, 1.4, 1.5, 1.75, 2, 2.5, 3,
] as const;

export const DEFAULT_AUDIOBOOK_PLAYBACK_RATE = 1;

/** The sleep timer's fixed lengths, in minutes. End of chapter is offered next to them. */
export const AUDIOBOOK_SLEEP_TIMER_MINUTES = [
  5, 10, 15, 30, 45, 60, 90,
] as const;

/**
 * The last stretch of a sleep timer fades the volume out instead of cutting
 * the sentence off, so falling asleep is not interrupted by a sudden stop.
 */
export const AUDIOBOOK_SLEEP_FADE_MS = 10_000;

/**
 * One tick of a sleep timer may count at most this much. The timer counts
 * time spent playing, and a tick that arrives late (the app was suspended, or
 * the native player stalled) must not eat minutes that were never heard.
 */
export const AUDIOBOOK_SLEEP_MAX_TICK_MS = 5_000;

/**
 * How often the native player reports the position, in seconds. The sleep
 * timer counts on these reports: Android pauses JS timers in the background,
 * native events still arrive (.claude/learned-facts/android-js-timers-pause-in-background.md).
 */
export const AUDIOBOOK_PROGRESS_EVENT_INTERVAL_SECONDS = 1;

/**
 * Rewind on resume after a pause: the longer the pause, the more of the story
 * is gone from memory. The first step whose pause is reached applies.
 */
export const AUDIOBOOK_AUTO_REWIND_STEPS: readonly {
  pausedForMs: number;
  seconds: number;
}[] = [
  { pausedForMs: 60 * 60_000, seconds: 30 },
  { pausedForMs: 10 * 60_000, seconds: 15 },
  { pausedForMs: 60_000, seconds: 5 },
];

/**
 * Previous chapter restarts the current one when this far into it, like
 * previous track does in music. Below it, it goes to the chapter before.
 */
export const AUDIOBOOK_CHAPTER_RESTART_SECONDS = 3;

/** How often the position is written to the device while a book plays. */
export const AUDIOBOOK_LOCAL_SAVE_INTERVAL_MS = 5_000;

/**
 * Library items asked for per request. A books library is read whole, since
 * its files have to be grouped into books before anything can be listed.
 */
export const AUDIOBOOK_LIBRARY_PAGE_SIZE = 500;

/** How many books the Listen now rows show. */
export const AUDIOBOOK_ROW_LIMIT = 20;

/**
 * The next part of a book is cached ahead only below this size, in bytes: a
 * whole multi-hour file would push every cached song out of the shared cache.
 */
export const AUDIOBOOK_LOOKAHEAD_MAX_BYTES = 200 * 1024 * 1024;

/** MMKV keys. Each holds JSON, versioned so a format change can start over. */
export const AUDIOBOOK_PROGRESS_KEY = "audiobooks.progress.v1";
export const AUDIOBOOK_SESSION_KEY = "audiobooks.session.v1";
export const AUDIOBOOK_DOWNLOADS_KEY = "audiobooks.downloads.v1";
export const AUDIOBOOK_BOOKMARKS_KEY = "audiobooks.bookmarks.v1";
