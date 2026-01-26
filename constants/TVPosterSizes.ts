import { TVTypographyScale, useSettings } from "@/utils/atoms/settings";

/**
 * TV Poster Sizes
 *
 * Base sizes for poster components on TV interfaces.
 * These are scaled dynamically based on the user's tvTypographyScale setting.
 */

export const TVPosterSizes = {
  /** Portrait posters (movies, series) - 10:15 aspect ratio */
  poster: 256,

  /** Landscape posters (continue watching, thumbs) - 16:9 aspect ratio */
  landscape: 396,

  /** Episode cards - 16:9 aspect ratio */
  episode: 336,

  /** Hero carousel cards - 16:9 aspect ratio */
  heroCard: 276,
} as const;

export type TVPosterSizeKey = keyof typeof TVPosterSizes;

/**
 * Linear poster size offsets (in pixels) - synchronized with typography scale.
 * Uses fixed pixel steps for consistent linear scaling across all poster types.
 */
const posterScaleOffsets: Record<TVTypographyScale, number> = {
  [TVTypographyScale.Small]: -10,
  [TVTypographyScale.Default]: 0,
  [TVTypographyScale.Large]: 10,
  [TVTypographyScale.ExtraLarge]: 20,
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
  const offset =
    posterScaleOffsets[settings.tvTypographyScale] ??
    posterScaleOffsets[TVTypographyScale.Default];

  return {
    poster: TVPosterSizes.poster + offset,
    landscape: TVPosterSizes.landscape + offset,
    episode: TVPosterSizes.episode + offset,
    heroCard: TVPosterSizes.heroCard + offset,
  };
};
