import { Platform } from "react-native";
import type { Settings } from "@/utils/atoms/settings";
import { defaultValues } from "@/utils/atoms/settings";

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

// Move bottom-aligned TV subtitles higher by default, away from the lower edge
// and player controls, without changing the stored/mobile margin value.
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
 */
export const getEffectiveSubtitleScale = (
  baseScale: number,
  videoWidth?: number | null,
  videoHeight?: number | null,
  screenWidth: number = 0,
  screenHeight: number = 0,
): number => {
  const tvScaleMultiplier = Platform.isTV ? TV_SUBTITLE_SCALE_MULTIPLIER : 1;
  const scaled = baseScale * SUBTITLE_BASE_FACTOR * tvScaleMultiplier;

  if (!videoWidth || !videoHeight || screenWidth <= 0 || screenHeight <= 0) {
    return scaled;
  }

  // "contain" fit factor — the same factor mpv uses to letterbox the video.
  const fitScale = Math.min(
    screenWidth / videoWidth,
    screenHeight / videoHeight,
  );

  // Video fills the surface — no compensation needed.
  if (fitScale >= 1) {
    return scaled;
  }

  // Undo the shrinkage, capped so on-screen size never exceeds ~3x the base.
  const boost = Math.min(1 / fitScale, MAX_SUBTITLE_BOOST);
  return Math.round(scaled * boost * 100) / 100;
};

export const getEffectiveSubtitleMarginY = (margin: number): number => {
  if (!Platform.isTV) {
    return margin;
  }

  return Math.round(margin * TV_SUBTITLE_MARGIN_Y_MULTIPLIER);
};

const normalizedColor = (color?: string) =>
  (color ?? defaultValues.subtitleColor).toUpperCase();

export const hasCustomSubtitleStyle = (settings: Settings): boolean => {
  const defaultSize = defaultValues.subtitleSize ?? 1;

  return (
    settings.subtitleBackground !== defaultValues.subtitleBackground ||
    Math.abs((settings.subtitleSize ?? defaultSize) - defaultSize) > 0.001 ||
    (settings.subtitleFont ?? defaultValues.subtitleFont) !==
      defaultValues.subtitleFont ||
    normalizedColor(settings.subtitleColor) !==
      normalizedColor(defaultValues.subtitleColor) ||
    (settings.subtitleMarginY ?? defaultValues.subtitleMarginY) !==
      defaultValues.subtitleMarginY ||
    (settings.subtitleAlignX ?? defaultValues.subtitleAlignX) !==
      defaultValues.subtitleAlignX ||
    (settings.subtitleAlignY ?? defaultValues.subtitleAlignY) !==
      defaultValues.subtitleAlignY
  );
};
