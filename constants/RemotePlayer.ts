/**
 * The remote player's active color: the TV it plays on, the subtitles turned
 * on, the episode playing, the track picked. Native mirrors:
 * `REMOTE_ACTIVE_COLOR` (PlayerConstants.kt) and `remoteActiveColor`
 * (PlayerConstants.swift), pinned by constants/RemotePlayer.test.ts.
 */
export const REMOTE_PLAYER_ACCENT = "#C9A7FB";

/**
 * CIELAB lightness (L*) of the background's tint: at the top, and from two
 * thirds of the way down. White text and the accent read on both.
 */
export const REMOTE_TINT_TOP_TONE = 20;
export const REMOTE_TINT_BOTTOM_TONE = 10;

/**
 * Under this CIELAB chroma an artwork's color is too grey to tint with, and the
 * background takes the neutral instead.
 */
export const REMOTE_TINT_MIN_CHROMA = 8;

/**
 * The background with no usable color: barely violet, at the two tones. The
 * native screens draw it too before a tint arrives (same mirrors as the accent).
 */
export const REMOTE_TINT_NEUTRAL = {
  top: "#342E3D",
  bottom: "#1F1927",
} as const;

/** How long the background takes to fade to a new tint (natives mirror it). */
export const REMOTE_TINT_FADE_MS = 300;

/**
 * How long the remote player's technical info waits after each reply before it reads again what the TV plays (the
 * receiver's session on the server), while the panel is open.
 */
export const REMOTE_TECHNICAL_INFO_REFRESH_MS = 2000;

/**
 * A subtitle the server downloads for the remote player is saved next to the media, and the item lists it a moment
 * later: the item is read again every REMOTE_SUBTITLE_POLL_MS, REMOTE_SUBTITLE_POLL_ATTEMPTS times at most, as the
 * local player does, before the screen says it could not be applied.
 */
export const REMOTE_SUBTITLE_POLL_MS = 1500;
export const REMOTE_SUBTITLE_POLL_ATTEMPTS = 8;

/**
 * The shapes, width over height, the remote screen sizes its image to before it loads: an episode's wide image
 * (its own, or its series', as the Continue Watching cards pick it), and a poster when the item gives none.
 */
export const REMOTE_WIDE_IMAGE_RATIO = 16 / 9;
export const REMOTE_POSTER_RATIO = 2 / 3;

/**
 * The widest the remote screen draws an episode's wide image, in points: half of a large phone lying down. What
 * is asked of the server covers it on this screen's pixels.
 */
export const REMOTE_WIDE_IMAGE_WIDTH = 480;
