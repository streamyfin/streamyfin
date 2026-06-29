import { TVTypographyScale, useSettings } from "@/utils/atoms/settings";
import { scaleSize } from "@/utils/scaleSize";

/**
 * TV Typography Scale
 *
 * Consistent text sizes for TV interface components.
 * Base values are designed for 1920x1080 and scaled to the actual viewport via
 * scaleSize(), then further adjusted by the user's tvTypographyScale setting.
 */

// =============================================================================
// BASE VALUES (at Default scale)
// =============================================================================

export const TVTypography = {
  /** Hero titles, movie/show names */
  display: 70,

  /** Episode series name, major headings */
  title: 42,

  /** Section headers (Cast, Technical Details, From this Series) */
  heading: 32,

  /** Overview, actor names, card titles, metadata */
  body: 40,

  /** Secondary text, labels, subtitles */
  callout: 26,
};

export type TVTypographyKey = keyof typeof TVTypography;

// =============================================================================
// SCALING
// =============================================================================

const scaleMultipliers: Record<TVTypographyScale, number> = {
  [TVTypographyScale.Small]: 0.6,
  [TVTypographyScale.Default]: 0.7,
  [TVTypographyScale.Large]: 0.84,
  [TVTypographyScale.ExtraLarge]: 0.98,
};

// =============================================================================
// HOOKS
// =============================================================================

export type ScaledTVTypography = {
  display: number;
  title: number;
  heading: number;
  body: number;
  callout: number;
};

/**
 * Returns the user's text-scale factor relative to the Default scale (1.0 at
 * Default, >1 for Large/ExtraLarge, <1 for Small). Use it to scale containers
 * (e.g. option-card width/height) in step with the scaled font so larger text
 * settings don't overflow fixed boxes.
 */
export const useTVRelativeScale = (): number => {
  const { settings } = useSettings();
  const scale =
    scaleMultipliers[settings.tvTypographyScale] ??
    scaleMultipliers[TVTypographyScale.Default];
  return scale / scaleMultipliers[TVTypographyScale.Default];
};

/**
 * Hook that returns scaled TV typography values based on user settings.
 * Use this instead of the static TVTypography constant for dynamic scaling.
 */
export const useScaledTVTypography = (): ScaledTVTypography => {
  const { settings } = useSettings();
  const scale =
    scaleMultipliers[settings.tvTypographyScale] ??
    scaleMultipliers[TVTypographyScale.Default];

  return {
    display: Math.round(scaleSize(TVTypography.display) * scale),
    title: Math.round(scaleSize(TVTypography.title) * scale),
    heading: Math.round(scaleSize(TVTypography.heading) * scale),
    body: Math.round(scaleSize(TVTypography.body) * scale),
    callout: Math.round(scaleSize(TVTypography.callout) * scale),
  };
};
