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

export const DOWNLOAD_MODES = ["original", "transcode"] as const;
export type DownloadMode = (typeof DOWNLOAD_MODES)[number];
export const DOWNLOAD_MODE_LABEL_KEYS: Record<DownloadMode, string> = {
  original: "item_card.download.mode_original",
  transcode: "item_card.download.mode_transcode",
};

// Auto leaves the codec to the device profile, which adds AV1 where it decodes.
export const DOWNLOAD_VIDEO_CODECS = ["auto", "h264", "hevc"] as const;
export type DownloadVideoCodec = (typeof DOWNLOAD_VIDEO_CODECS)[number];
// Codec names read the same in every language; only Auto is translated.
export const DOWNLOAD_VIDEO_CODEC_NAMES: Record<
  Exclude<DownloadVideoCodec, "auto">,
  string
> = {
  h264: "H.264",
  hevc: "HEVC",
};
