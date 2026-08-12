/** Jellyfin's non-ISO sentinel for server-side original-track selection. */
export const ORIGINAL_LANGUAGE = "OriginalLanguage";

/** Landed in Jellyfin 12, see jellyfin/jellyfin#12579. */
export const supportsOriginalAudioLanguage = (version?: string | null) => {
  const major = version?.split(".", 1)[0];
  return /^\d+$/.test(major ?? "") && Number(major) >= 12;
};
