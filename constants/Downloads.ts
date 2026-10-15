export const DOWNLOAD_TICKS_PER_SECOND = 10_000_000;
export const DOWNLOAD_BITS_PER_BYTE = 8;
// Leave 10% room for the container and metadata in transcoded estimates.
export const DOWNLOAD_SIZE_OVERHEAD = 1.1;

// Names of what a download writes next to its video. The writer and the cleanup both go
// through the builders in providers/Downloads/utils.ts, so a rename cannot leave the cleanup
// looking for the old name.
export const DOWNLOAD_SUBTITLE_INFIX = "_subtitle_";
export const DOWNLOAD_TRICKPLAY_DIR_SUFFIX = "_trickplay";
// Android stages the transfer in `<destination>.part` and renames it once it is complete
// (OkHttpDownloadManager.kt). The native side owns the value; this mirrors it.
export const DOWNLOAD_PART_FILE_SUFFIX = ".part";

// "Keep next episodes downloaded": the counts a series rule offers, and the one a new rule
// starts with unless the user or the server admin chose another.
export const NEXT_EPISODES_COUNTS = [3, 5, 10] as const;
export const DEFAULT_NEXT_EPISODES_COUNT = 3;
// Below this much free space no episode is downloaded automatically. A season of episodes
// fills a phone quickly, and a full disk breaks more than the downloads: the app's own
// storage and the system's updates need room too.
// Decimal, as the downloads page shows sizes, so the notice reads "2 GB".
export const NEXT_EPISODES_MIN_FREE_BYTES = 2 * 1000 ** 3;
// Where the series rules are stored, per user.
export const NEXT_EPISODES_RULES_KEY = "downloads.nextEpisodesRules.v1";
