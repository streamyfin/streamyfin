/** MMKV: the signed-in Seerr user. */
export const SEERR_USER_STORAGE_KEY = "SEERR_USER";

/** MMKV: the Seerr session cookies. */
export const SEERR_COOKIES_STORAGE_KEY = "SEERR_COOKIES";

/** SecureStore: prefix of the password auto-login keeps, per server and user. */
export const SEERR_PASSWORD_KEY_PREFIX = "seerrpw_";

/*
 * Where builds from before the rename stored the same things, when Seerr was
 * called Jellyseerr. Each is read once, moved to the name above, and deleted.
 * They can go once no such build is left to update from.
 */

export const LEGACY_SEERR_USER_STORAGE_KEY = "JELLYSEERR_USER";
export const LEGACY_SEERR_COOKIES_STORAGE_KEY = "JELLYSEERR_COOKIES";
export const LEGACY_SEERR_PASSWORD_KEY_PREFIX = "jellyseerrpw_";

/** The name Seerr's custom headers were filed under, in MMKV and SecureStore. */
export const LEGACY_SEERR_HEADERS_NAME = "jellyseerr";
