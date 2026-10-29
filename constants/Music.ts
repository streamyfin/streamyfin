/**
 * Which server gain evens out the loudness of music tracks. `album` keeps the
 * level differences inside an album and falls back to `track` when the album
 * has no gain; `track` falls back to leaving the track alone.
 */
export const MUSIC_NORMALIZATION_MODES = ["off", "track", "album"] as const;
export type MusicNormalizationMode = (typeof MUSIC_NORMALIZATION_MODES)[number];

/**
 * Off, so an update does not make everyone's music quieter: almost every gain
 * is negative, since the server levels to -18 LUFS and most masters are louder.
 */
export const DEFAULT_MUSIC_NORMALIZATION_MODE: MusicNormalizationMode = "off";

/**
 * Ceiling on the linear gain applied to a track. The player volume cannot
 * amplify, and a gain above 1 would clip a full scale master anyway, so a
 * track the server wants louder plays untouched instead.
 */
export const MUSIC_NORMALIZATION_MAX_VOLUME = 1;

/**
 * Most songs Play all and Shuffle queue from a music library or folder. Each
 * one is a full item the request has to carry before playback can start, and
 * a library can hold tens of thousands. Shuffle lets the server pick them, so
 * the cap draws a random sample of everything below the folder instead of
 * shuffling its first page. jellyfin-web stops at 300.
 */
export const MUSIC_PLAY_QUEUE_MAX_ITEMS = 500;

/** Storage key: whether a music folder's Play all and Shuffle reach into its subfolders. */
export const MUSIC_FOLDER_INCLUDE_SUBFOLDERS_KEY =
  "music_folder_include_subfolders";

/** MMKV key of the index of stored tracks: user downloads and the look-ahead cache. */
export const AUDIO_STORAGE_INDEX_KEY = "audio_storage.v1.json";
