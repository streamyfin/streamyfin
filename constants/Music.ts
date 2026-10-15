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
