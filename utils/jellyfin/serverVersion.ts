/** Jellyfin's non-ISO sentinel for server-side original-track selection. */
export const ORIGINAL_LANGUAGE = "OriginalLanguage";

const isJellyfin12OrNewer = (version?: string | null) => {
  const major = version?.split(".", 1)[0];
  return /^\d+$/.test(major ?? "") && Number(major) >= 12;
};

/** Landed in Jellyfin 12, see jellyfin/jellyfin#12579. */
export const supportsOriginalAudioLanguage = isJellyfin12OrNewer;

/**
 * Each version of a multi-version item keeps its own UserData from Jellyfin
 * 12 on (jellyfin/jellyfin#16828); before that the primary item carries it.
 */
export const supportsPerVersionUserData = isJellyfin12OrNewer;
