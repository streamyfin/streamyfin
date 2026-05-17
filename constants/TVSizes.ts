import { useMemo } from "react";
import { Platform, useWindowDimensions } from "react-native";
import { TVTypographyScale, useSettings } from "@/utils/atoms/settings";

const TV_BASELINE_WIDTH = 1920;
const MIN_TV_VIEWPORT_SCALE = 0.5;

/**
 * Normalizes TV layout values across platforms.
 *
 * tvOS reports a 1920-wide logical viewport on common TV targets, while
 * Android TV often reports density-independent widths such as 960 for a
 * 1080p display. Scaling against a 1920 baseline keeps the UI from appearing
 * oversized on Android TV while preserving the current tvOS sizing.
 */
export const useTVViewportScale = () => {
  const { width } = useWindowDimensions();

  return useMemo(() => {
    if (!Platform.isTV || width <= 0) return 1;

    return Math.min(
      1,
      Math.max(MIN_TV_VIEWPORT_SCALE, width / TV_BASELINE_WIDTH),
    );
  }, [width]);
};

export const useTVDesignTokens = () => {
  const scale = useTVViewportScale();
  const scaled = (value: number) => Math.round(value * scale);

  return useMemo(
    () => ({
      scale,
      size: scaled,
      spacing: {
        xxs: scaled(4),
        xs: scaled(8),
        sm: scaled(12),
        md: scaled(16),
        lg: scaled(20),
        xl: scaled(24),
        "2xl": scaled(32),
        "3xl": scaled(40),
        "4xl": scaled(48),
      },
      radius: {
        sm: scaled(8),
        md: scaled(12),
        lg: scaled(16),
        xl: scaled(24),
      },
      page: {
        horizontal: scaled(80),
        horizontalCompact: scaled(60),
        top: scaled(140),
        topCompact: scaled(100),
        focusPadding: scaled(20),
      },
      shadow: {
        md: scaled(12),
        lg: scaled(15),
        xl: scaled(20),
      },
      button: {
        paddingVertical: scaled(18),
        paddingHorizontal: scaled(32),
        squarePadding: scaled(18),
        minWidth: scaled(180),
      },
    }),
    [scale],
  );
};

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
  const viewportScale = useTVViewportScale();
  const userScale =
    sizeScaleMultipliers[settings.tvTypographyScale] ??
    sizeScaleMultipliers[TVTypographyScale.Default];
  const scale = userScale * viewportScale;

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
      heroHeight: TVPadding.heroHeight * userScale,
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
