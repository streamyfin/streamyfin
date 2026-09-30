export const DOWNLOAD_TICKS_PER_SECOND = 10_000_000;
export const DOWNLOAD_BITS_PER_BYTE = 8;
// Leave 10% room for the container and metadata in transcoded estimates.
export const DOWNLOAD_SIZE_OVERHEAD = 1.1;

/** Native multi-track remux inputs must be progressive H.264 without B-frames. */
export const DOWNLOAD_MULTI_TRACK_VIDEO_CODEC = "h264";
export const DOWNLOAD_MULTI_TRACK_VIDEO_PROFILE = "baseline";
export const DOWNLOAD_MULTI_TRACK_VIDEO_BIT_DEPTH = 8;
/** Force AAC-LC at 128 kbps, capped at stereo; mono sources are not upmixed. */
export const DOWNLOAD_MULTI_TRACK_AUDIO_CODEC = "aac";
export const DOWNLOAD_MULTI_TRACK_AUDIO_PROFILE = "LC";
export const DOWNLOAD_MULTI_TRACK_AUDIO_BITRATE = 128_000;
export const DOWNLOAD_MULTI_TRACK_AUDIO_CHANNELS = 2;
export const DOWNLOAD_MULTI_TRACK_MIN_AUDIO_TRACKS = 2;
/** Extra audio uses a disposable, very small video until Jellyfin #17436 is fixed. */
export const DOWNLOAD_MULTI_TRACK_EXTRA_VIDEO_WIDTH = 160;
export const DOWNLOAD_MULTI_TRACK_EXTRA_VIDEO_HEIGHT = 90;
export const DOWNLOAD_MULTI_TRACK_EXTRA_VIDEO_FRAMERATE = 1;
export const DOWNLOAD_MULTI_TRACK_EXTRA_VIDEO_BITRATE = 32_000;
