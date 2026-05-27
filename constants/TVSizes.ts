import { TVTypographyScale, useSettings } from "@/utils/atoms/settings";
import { scaleSize } from "@/utils/scaleSize";

/**
 * TV Layout Sizes
 *
 * Unified constants for TV interface layout including posters, gaps, and padding.
 * Base values are designed for 1920x1080 and scaled to the actual viewport via
 * scaleSize(), then further adjusted by the user's tvTypographyScale setting.
 */

// =============================================================================
// BASE VALUES (at Default scale)
// =============================================================================

/**
 * Base poster widths in pixels.
 * Heights are calculated from aspect ratios.
 */
export const TVPosterSizes = {
  /** Portrait posters (movies, series) - 10:15 aspect ratio */
  poster: 300,

  /** Landscape posters (continue watching, thumbs, hero) - 16:9 aspect ratio */
  landscape: 470,

  /** Episode cards - 16:9 aspect ratio */
  episode: 440,
} as const;

/**
 * Base gap/spacing values in pixels.
 */
export const TVGaps = {
  /** Gap between items in horizontal lists */
  item: 24,

  /** Gap between sections vertically */
  section: 32,

  /** Small gap for tight layouts */
  small: 12,

  /** Large gap for spacious layouts */
  large: 48,
} as const;

/**
 * Base padding values in pixels.
 */
export const TVPadding = {
  /** Horizontal padding from screen edges */
  horizontal: 90,

  /** Padding to accommodate scale animations (1.05x) */
  scale: 20,

  /** Vertical padding for content areas */
  vertical: 24,

  /** Hero section height as percentage of screen height (0.0 - 1.0) */
  heroHeight: 0.6,
} as const;

/**
 * Animation and interaction values.
 */
export const TVAnimation = {
  /** Scale factor for focused items */
  focusScale: 1.05,
} as const;

// =============================================================================
// SCALING
// =============================================================================

/**
 * Scale multipliers for each typography scale level.
 * Applied to poster sizes and gaps.
 */
const sizeScaleMultipliers: Record<TVTypographyScale, number> = {
  [TVTypographyScale.Small]: 0.53,
  [TVTypographyScale.Default]: 0.63,
  [TVTypographyScale.Large]: 0.77,
  [TVTypographyScale.ExtraLarge]: 0.84,
};

// =============================================================================
// HOOKS
// =============================================================================

export type ScaledTVPosterSizes = {
  poster: number;
  landscape: number;
  episode: number;
};

export type ScaledTVGaps = {
  item: number;
  section: number;
  small: number;
  large: number;
};

export type ScaledTVPadding = {
  horizontal: number;
  scale: number;
  vertical: number;
  heroHeight: number;
};

export type ScaledTVSizes = {
  posters: ScaledTVPosterSizes;
  gaps: ScaledTVGaps;
  padding: ScaledTVPadding;
  animation: typeof TVAnimation;
};

/**
 * Hook that returns all scaled TV sizes based on user settings.
 *
 * @example
 * const sizes = useScaledTVSizes();
 * <View style={{ width: sizes.posters.poster, marginRight: sizes.gaps.item }}>
 */
export const useScaledTVSizes = (): ScaledTVSizes => {
  const { settings } = useSettings();
  const scale =
    sizeScaleMultipliers[settings.tvTypographyScale] ??
    sizeScaleMultipliers[TVTypographyScale.Default];

  return {
    posters: {
      poster: Math.round(scaleSize(TVPosterSizes.poster) * scale),
      landscape: Math.round(scaleSize(TVPosterSizes.landscape) * scale),
      episode: Math.round(scaleSize(TVPosterSizes.episode) * scale),
    },
    gaps: {
      item: Math.round(scaleSize(TVGaps.item) * scale),
      section: Math.round(scaleSize(TVGaps.section) * scale),
      small: Math.round(scaleSize(TVGaps.small) * scale),
      large: Math.round(scaleSize(TVGaps.large) * scale),
    },
    padding: {
      horizontal: Math.round(scaleSize(TVPadding.horizontal) * scale),
      scale: Math.round(scaleSize(TVPadding.scale) * scale),
      vertical: Math.round(scaleSize(TVPadding.vertical) * scale),
      heroHeight: TVPadding.heroHeight * scale,
    },
    animation: TVAnimation,
  };
};

/**
 * Hook that returns only scaled poster sizes.
 * Use this for backwards compatibility or when you only need poster sizes.
 */
export const useScaledTVPosterSizes = (): ScaledTVPosterSizes => {
  const sizes = useScaledTVSizes();
  return sizes.posters;
};

/**
 * Hook that returns only scaled gap sizes.
 */
export const useScaledTVGaps = (): ScaledTVGaps => {
  const sizes = useScaledTVSizes();
  return sizes.gaps;
};

/**
 * Hook that returns only scaled padding sizes.
 */
export const useScaledTVPadding = (): ScaledTVPadding => {
  const sizes = useScaledTVSizes();
  return sizes.padding;
};
