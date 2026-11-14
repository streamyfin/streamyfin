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

/** MMKV key of the index of stored tracks: user downloads and the look-ahead cache. */
export const AUDIO_STORAGE_INDEX_KEY = "audio_storage.v1.json";

/** How many upcoming songs the music cache can fetch ahead, as its settings offer. */
export const MUSIC_LOOKAHEAD_COUNTS = [1, 2, 3, 5] as const;

/**
 * Seconds into a track past which Previous goes back to its start rather than
 * to the track before, on the phone and on a Cast receiver, as most players do.
 */
export const PREVIOUS_RESTARTS_TRACK_AFTER_SECONDS = 3;
