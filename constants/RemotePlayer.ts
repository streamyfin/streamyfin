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
