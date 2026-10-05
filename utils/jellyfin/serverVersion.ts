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

/**
 * An administrator can approve a Quick Connect code for another user since
 * Jellyfin 10.9, where the authorize endpoint gained its `userId`. 10.8 has
 * no such parameter and approves for the caller whatever is sent. The web
 * client only grew a picker for it in 12.1 (jellyfin/jellyfin-web#8470), but
 * the server side is what decides.
 */
export const supportsQuickConnectForOtherUsers = (version?: string | null) => {
  const [major, minor] = (version ?? "").split(".", 2);
  if (!/^\d+$/.test(major ?? "") || !/^\d+$/.test(minor ?? "")) return false;
  return Number(major) > 10 || (Number(major) === 10 && Number(minor) >= 9);
};

/**
 * Jellyfin 12 scopes a BoxSet or Playlist query to the library given as its
 * parent (jellyfin/jellyfin#16882, #16893). Older servers drop the parent of a
 * BoxSet query, so every library would list every collection, and never hold a
 * playlist under a library.
 */
export const supportsLibraryCollectionsAndPlaylists = (
  version?: string | null,
) => isServerMajorAtLeast(version, 12);

/**
 * Filtering a library by audio or subtitle language landed in Jellyfin 12, see
 * jellyfin/jellyfin#9787. An older server ignores the query parameters and
 * answers Filters2 without the language lists.
 */
export const supportsLanguageFilters = (version?: string | null) =>
  isServerMajorAtLeast(version, 12);
