import { TVTypographyScale, useSettings } from "@/utils/atoms/settings";

/**
 * TV Layout Sizes
 *
 * Unified constants for TV interface layout including posters, gaps, and padding.
 * All values scale based on the user's tvTypographyScale setting.
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
  poster: 210,

  /** Landscape posters (continue watching, thumbs, hero) - 16:9 aspect ratio */
  landscape: 340,

  /** Episode cards - 16:9 aspect ratio */
  episode: 320,
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
  horizontal: 60,

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
  [TVTypographyScale.Small]: 0.9,
  [TVTypographyScale.Default]: 1.0,
  [TVTypographyScale.Large]: 1.1,
  [TVTypographyScale.ExtraLarge]: 1.2,
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
      poster: Math.round(TVPosterSizes.poster * scale),
      landscape: Math.round(TVPosterSizes.landscape * scale),
      episode: Math.round(TVPosterSizes.episode * scale),
    },
    gaps: {
      item: Math.round(TVGaps.item * scale),
      section: Math.round(TVGaps.section * scale),
      small: Math.round(TVGaps.small * scale),
      large: Math.round(TVGaps.large * scale),
    },
    padding: {
      horizontal: Math.round(TVPadding.horizontal * scale),
      scale: Math.round(TVPadding.scale * scale),
      vertical: Math.round(TVPadding.vertical * scale),
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
