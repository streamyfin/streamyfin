import { TVTypographyScale, useSettings } from "@/utils/atoms/settings";

/**
 * TV Poster Sizes
 *
 * Base sizes for poster components on TV interfaces.
 * These are scaled dynamically based on the user's tvTypographyScale setting.
 */

export const TVPosterSizes = {
  /** Portrait posters (movies, series) - 10:15 aspect ratio */
  poster: 260,

  /** Landscape posters (continue watching, thumbs) - 16:9 aspect ratio */
  landscape: 400,

  /** Episode cards - 16:9 aspect ratio */
  episode: 340,

  /** Hero carousel cards - 16:9 aspect ratio */
  heroCard: 280,
} as const;

export type TVPosterSizeKey = keyof typeof TVPosterSizes;

/**
 * Poster scale multipliers - much smaller range than typography.
 * Posters are already near-perfect size, only need slight increases at larger settings.
 */
const posterScaleMultipliers: Record<TVTypographyScale, number> = {
  [TVTypographyScale.Small]: 0.95,
  [TVTypographyScale.Default]: 1.0,
  [TVTypographyScale.Large]: 1.05,
  [TVTypographyScale.ExtraLarge]: 1.1,
};

/**
 * Hook that returns scaled TV poster sizes based on user settings.
 * Use this instead of the static TVPosterSizes constant for dynamic scaling.
 *
 * @example
 * const posterSizes = useScaledTVPosterSizes();
 * <View style={{ width: posterSizes.poster }}>
 */
export const useScaledTVPosterSizes = () => {
  const { settings } = useSettings();
  const scale =
    posterScaleMultipliers[settings.tvTypographyScale] ??
    posterScaleMultipliers[TVTypographyScale.Default];

  return {
    poster: Math.round(TVPosterSizes.poster * scale),
    landscape: Math.round(TVPosterSizes.landscape * scale),
    episode: Math.round(TVPosterSizes.episode * scale),
    heroCard: Math.round(TVPosterSizes.heroCard * scale),
  };
};
