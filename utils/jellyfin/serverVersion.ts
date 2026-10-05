/** Jellyfin's non-ISO sentinel for server-side original-track selection. */
export const ORIGINAL_LANGUAGE = "OriginalLanguage";

const isServerMajorAtLeast = (
  version: string | null | undefined,
  min: number,
) => {
  const major = version?.split(".", 1)[0];
  return /^\d+$/.test(major ?? "") && Number(major) >= min;
};

/** Landed in Jellyfin 12, see jellyfin/jellyfin#12579. */
export const supportsOriginalAudioLanguage = (version?: string | null) =>
  isServerMajorAtLeast(version, 12);

/**
 * `GET /Items/{itemId}/Collections` landed in Jellyfin 12, see
 * jellyfin/jellyfin#15516. Older servers answer it with a 404.
 */
export const supportsItemCollections = (version?: string | null) =>
  isServerMajorAtLeast(version, 12);
