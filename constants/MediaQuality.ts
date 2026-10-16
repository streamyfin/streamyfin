/**
 * Shared thresholds and labels for the media-quality badges shown on TV Top Shelf
 * items (see utils/jellyfin/getMediaQualityBadges.ts). Kept here because the
 * width threshold is a tunable and the label strings are referenced from both
 * the badge helper and its tests.
 */

/**
 * Minimum video stream width treated as "4K". Real UHD masters are 3840 wide,
 * but scope-ratio and slightly cropped encodes land a little under that, so the
 * threshold sits below 3840 to catch them while staying clear of 1080p (1920).
 */
export const UHD_MIN_WIDTH = 3800;

export const MEDIA_QUALITY_BADGE = {
  uhd: "4K",
  dolbyVision: "Dolby Vision",
  hdr10Plus: "HDR10+",
  hdr10: "HDR10",
  hlg: "HLG",
  hdr: "HDR",
  atmos: "Atmos",
  cc: "CC",
  sdh: "SDH",
  ad: "AD",
} as const;

/**
 * Fixed display order for the badge line. The helper emits at most one HDR
 * token, so only one of the HDR entries appears in any given result.
 */
export const MEDIA_QUALITY_BADGE_ORDER: readonly string[] = [
  MEDIA_QUALITY_BADGE.uhd,
  MEDIA_QUALITY_BADGE.dolbyVision,
  MEDIA_QUALITY_BADGE.hdr10Plus,
  MEDIA_QUALITY_BADGE.hdr10,
  MEDIA_QUALITY_BADGE.hlg,
  MEDIA_QUALITY_BADGE.hdr,
  MEDIA_QUALITY_BADGE.atmos,
  MEDIA_QUALITY_BADGE.cc,
  MEDIA_QUALITY_BADGE.sdh,
  MEDIA_QUALITY_BADGE.ad,
];

/** Cap so a badge line never crowds out the title/summary it is spliced into. */
export const MEDIA_QUALITY_BADGE_LIMIT = 5;
