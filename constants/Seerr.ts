/** MMKV: the signed-in Seerr user. */
export const SEERR_USER_STORAGE_KEY = "SEERR_USER";

/** MMKV: the Seerr session cookies. */
export const SEERR_COOKIES_STORAGE_KEY = "SEERR_COOKIES";

/** SecureStore: prefix of the password auto-login keeps, per server and user. */
export const SEERR_PASSWORD_KEY_PREFIX = "seerrpw_";

/** Pages of search results asked for at once, 20 results a page. */
export const SEERR_SEARCH_PAGES = 4;

/**
 * The space between two rows of Discover, the home screen's own (space-y-4):
 * Seerr's 24 left too much room under posters that carry their title.
 */
export const SEERR_DISCOVER_ROW_GAP = 16;

/** The quality Seerr's image resizer is asked for, Next.js's own default. */
export const SEERR_IMAGE_QUALITY = 75;

/**
 * An episode still, drawn 128 points wide: TMDB's size asked for, and the
 * width Seerr's resizer brings it to.
 */
export const SEERR_STILL_SIZE = "w300";
export const SEERR_STILL_WIDTH = 640;

/** The height of a season's header, which stays in view while its episodes pass. */
export const SEERR_SEASON_HEADER_HEIGHT = 48;

/**
 * The fade under a pinned season header, in points: an episode passing under
 * it fades out there rather than leaving a strip of its picture below it.
 */
export const SEERR_SEASON_FADE_HEIGHT = 32;

/** How far a pinned season header follows the scroll before the band above it is opaque. */
export const SEERR_SEASON_BAND_FADE = 24;

/** Seerr's request card in a Discover row: its width, and its poster. */
export const SEERR_REQUEST_CARD_WIDTH = 320;
export const SEERR_REQUEST_CARD_POSTER = { width: 80, height: 120 } as const;

/**
 * How often a request card asks for its request again while one of its
 * downloads is under way, and only then, as Seerr does (refreshIntervalHelper).
 */
export const SEERR_DOWNLOAD_REFRESH_MS = 15_000;

/** The fade at the edge of a request card's season row where more is hidden. */
export const SEERR_PILL_FADE_WIDTH = 20;

/**
 * How far a finger moves sideways before a request card's seasons slide:
 * under the few points a scroll view waits, so the row of cards around them
 * does not take the swipe first.
 */
export const SEERR_PILL_PAN_SLOP = 4;

/**
 * Seerr's request card on the TV, in points at 1080p: its width, the poster
 * on its right, and how many seasons it lists before a "+N".
 */
export const SEERR_TV_REQUEST_CARD_WIDTH = 640;
export const SEERR_TV_REQUEST_CARD_POSTER = {
  width: 120,
  height: 180,
} as const;
export const SEERR_TV_REQUEST_CARD_SEASONS = 5;

/** A genre's or a company's card in a TV Discover row, in points at 1080p. */
export const SEERR_TV_SLIDE_CARD_WIDTH = 300;

/** A Seerr badge over a TV poster, in points at 1080p: its size and inset. */
export const SEERR_TV_BADGE_SIZE = 36;
export const SEERR_TV_BADGE_INSET = 10;

/** A season row the quota leaves no room for, greyed as on Seerr's site. */
export const SEERR_BLOCKED_OPACITY = 0.45;

/** The alpha a season's status colour takes behind its icon, about 18%. */
export const SEERR_STATUS_TINT_ALPHA = "2e";

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
