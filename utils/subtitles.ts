import { Platform } from "react-native";

export { hasCustomSubtitleStyle } from "@/utils/subtitles/subtitleStyle";

/**
 * Shared subtitle scaling logic.
 *
 * mpv renders subtitles in the video's coordinate space and scales them onto
 * the screen with the video (`sub-scale-with-window=no`). When a video is
 * letterboxed inside the player — a landscape movie on a phone held vertically,
 * or a portrait video in a landscape player — the subtitle shrinks by the
 * video→screen fit factor and looks tiny. mpv's own `sub-scale-with-window=yes`
 * would compensate but it is uncapped, so it overshoots to comically large.
 *
 * Instead we keep mpv's scaling video-relative and apply a capped boost in JS,
 * matching what mpv would do but with a sane ceiling.
 */

/** Sample video used by the subtitle preview (16:9). */
export const SUBTITLE_PREVIEW_VIDEO_WIDTH = 1280;
export const SUBTITLE_PREVIEW_VIDEO_HEIGHT = 720;

const MAX_SUBTITLE_BOOST = 3;

// TV subtitles are read from much farther away than mobile subtitles. Keep the
// stored user-facing scale consistent (1.0 still means "normal" in settings),
// but render it larger on TV.
const TV_SUBTITLE_SCALE_MULTIPLIER = 1.25;

// Native subtitle baselines differ by player and platform. Android MPV keeps
// its renderer calibration, normal Android/iOS receive mobile readability
// adjustments, and TV MPV is reduced slightly after viewing-distance testing.
// ExoPlayer's tested Android TV size remains unchanged. Keep these render-time
// only so the stored user scale remains consistent across player changes.
const ANDROID_MPV_SUBTITLE_SCALE_MULTIPLIER = 1.25 * 1.15;
const ANDROID_EXOPLAYER_SUBTITLE_SCALE_MULTIPLIER = 1.25 * 0.6;
const ANDROID_MOBILE_MPV_SUBTITLE_SCALE_MULTIPLIER = 1.2;
const IOS_MOBILE_MPV_SUBTITLE_SCALE_MULTIPLIER = 1.25 * 1.2;
const ANDROID_TV_MPV_SUBTITLE_SCALE_MULTIPLIER = 0.875 * 0.95 * 0.95;
const IOS_TV_MPV_SUBTITLE_SCALE_MULTIPLIER = 0.875 * 1.05 * 1.05;

const getPlatformScaleMultiplier = (playerType: "mpv" | "exoplayer") => {
  const tv = Platform.isTV ? TV_SUBTITLE_SCALE_MULTIPLIER : 1;
  if (playerType === "exoplayer") {
    return (
      tv *
      (Platform.OS === "android"
        ? ANDROID_EXOPLAYER_SUBTITLE_SCALE_MULTIPLIER
        : 1)
    );
  }
  if (Platform.OS === "android") {
    return (
      tv *
      ANDROID_MPV_SUBTITLE_SCALE_MULTIPLIER *
      (Platform.isTV
        ? ANDROID_TV_MPV_SUBTITLE_SCALE_MULTIPLIER
        : ANDROID_MOBILE_MPV_SUBTITLE_SCALE_MULTIPLIER)
    );
  }
  if (Platform.OS !== "ios") return tv;
  return (
    tv *
    (Platform.isTV
      ? IOS_TV_MPV_SUBTITLE_SCALE_MULTIPLIER
      : IOS_MOBILE_MPV_SUBTITLE_SCALE_MULTIPLIER)
  );
};

// Keep equal stored margins visually aligned across mobile platforms while
// preserving the already-tested TV placement.
const MOBILE_SUBTITLE_MARGIN_Y_MULTIPLIER = 1.5;
const TV_SUBTITLE_MARGIN_Y_MULTIPLIER = 2;

// mpv's default subtitle font size is calibrated for desktop windowed
// playback; on mobile/TV it renders noticeably larger than expected. A user
// scale of 1.0 should read as a comfortable default, so we apply this fixed
// factor before any portrait/letterbox compensation. (1.0 ≈ the old 0.6.)
const SUBTITLE_BASE_FACTOR = 0.6;

/**
 * Returns the effective subtitle scale to pass to `setSubtitleScale`.
 *
 * @param baseScale      The user's chosen subtitle size (1.0 = normal).
 * @param videoWidth     Video frame width in pixels (from MediaStreams).
 * @param videoHeight    Video frame height in pixels.
 * @param screenWidth    Player surface width in pixels.
 * @param screenHeight   Player surface height in pixels.
 * @param fitMode        How the video is fitted inside the player surface.
 * @param playerType     Native subtitle renderer receiving the scale.
 */
export const getEffectiveSubtitleScale = (
  baseScale: number,
  videoWidth?: number | null,
  videoHeight?: number | null,
  screenWidth: number = 0,
  screenHeight: number = 0,
  fitMode: "contain" | "cover" = "contain",
  playerType: "mpv" | "exoplayer" = "mpv",
): number => {
  const scaled =
    baseScale * SUBTITLE_BASE_FACTOR * getPlatformScaleMultiplier(playerType);

  // ExoPlayer sizes text as a fraction of SubtitleView's viewport, so it is
  // already independent of video resolution and letterboxing. Applying MPV's
  // video-to-screen compensation here makes ExoPlayer subtitles enormous.
  if (
    playerType === "exoplayer" ||
    !videoWidth ||
    !videoHeight ||
    screenWidth <= 0 ||
    screenHeight <= 0
  ) {
    return scaled;
  }

  // Match the player surface fit: contain letterboxes, cover crops.
  const fitScale =
    fitMode === "cover"
      ? Math.max(screenWidth / videoWidth, screenHeight / videoHeight)
      : Math.min(screenWidth / videoWidth, screenHeight / videoHeight);

  // Video fills the surface — no compensation needed.
  if (fitScale >= 1) {
    return scaled;
  }

  // Undo the shrinkage, capped so on-screen size never exceeds ~3x the base.
  const boost = Math.min(1 / fitScale, MAX_SUBTITLE_BOOST);
  return Math.round(scaled * boost * 100) / 100;
};

export const getEffectiveSubtitleMarginY = (margin: number): number => {
  if (Platform.isTV) {
    return Math.round(margin * TV_SUBTITLE_MARGIN_Y_MULTIPLIER);
  }
  if (Platform.OS === "android" || Platform.OS === "ios") {
    return Math.round(margin * MOBILE_SUBTITLE_MARGIN_Y_MULTIPLIER);
  }
  return margin;
};
