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

// A failed download's toast says why and what to do in two or three lines, more than the four
// seconds the Toaster gives a toast leave time to read.
export const DOWNLOAD_FAILURE_TOAST_DURATION_MS = 8000;

// A failed download's card stays in the list this long, so its error is seen before it goes.
export const FAILED_DOWNLOAD_CARD_REMOVAL_DELAY_MS = 3000;

// Storage key of the downloads whose watch progress was saved while the server could not be
// reached, per user, waiting to be pushed (utils/offlineProgressQueue.ts).
export const OFFLINE_PROGRESS_PENDING_KEY = "offlineProgressPending";

// How long one offline progress sync may run before it is released, in ms: a request that never
// settles would otherwise keep the sync off until the app restarts (hooks/useOfflineProgressSync.ts).
export const OFFLINE_PROGRESS_SYNC_TIMEOUT_MS = 60_000;

// What the speed on a download card is averaged over. Progress comes in bursts, so a window much
// shorter than this reads a lull as a collapse, and a longer one is slow to show a real change.
export const DOWNLOAD_SPEED_WINDOW_MS = 15_000;
// The least time the window must span before the card shows a speed: one burst read over half a
// second would show a rate the download never keeps.
export const DOWNLOAD_SPEED_MIN_ELAPSED_MS = 2_000;
// How long a running download goes without progress before its card says so instead of keeping
// the last speed on screen.
export const DOWNLOAD_STALL_AFTER_MS = 15_000;
