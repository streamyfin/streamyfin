/**
 * Sentinel stored in `UserConfiguration.AudioLanguagePreference` to ask the
 * server for the item's original audio language.
 *
 * Jellyfin compares this value case-insensitively in
 * `MediaSourceManager.SetDefaultAudioStreamIndex`, so it has to be sent
 * verbatim. It is not an ISO 639-2 code: no media stream ever reports it as its
 * language, and the actual track is resolved server-side and delivered through
 * `MediaSourceInfo.DefaultAudioStreamIndex`.
 */
export const ORIGINAL_LANGUAGE = "OriginalLanguage";

/** First Jellyfin major version that understands {@link ORIGINAL_LANGUAGE}. */
const ORIGINAL_LANGUAGE_MIN_MAJOR = 12;

/**
 * Major version of a Jellyfin version string, `12.0.0` or `12.0.0-rc5` style.
 * Anything that is not a plain numeric major is rejected rather than truncated
 * the way `parseInt` would.
 */
const VERSION_MAJOR = /^(\d+)(?:[.\-+].*)?$/;

/**
 * Whether the server understands the original-language audio preference.
 *
 * Added in Jellyfin 12 (jellyfin/jellyfin#12579); 10.11 and older ignore the
 * value and fall back to their regular track selection. An unknown or
 * unparseable version is treated as unsupported, so the option stays hidden
 * instead of persisting a preference the server cannot honour.
 */
export const supportsOriginalAudioLanguage = (version?: string | null) => {
  const major = VERSION_MAJOR.exec(version ?? "")?.[1];
  return major !== undefined && Number(major) >= ORIGINAL_LANGUAGE_MIN_MAJOR;
};
