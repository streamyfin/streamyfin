import { TVTypographyScale, useSettings } from "@/utils/atoms/settings";

/**
 * TV Typography Scale
 *
 * Consistent text sizes for TV interface components.
 * Design values are for 1920×1080 and scaled proportionally
 * to the actual viewport via scaleSize().
 */

import { scaleSize } from "@/utils/scaleSize";

export const TVTypography = {
  /** Hero titles, movie/show names */
  display: scaleSize(70),

  /** Episode series name, major headings */
  title: scaleSize(42),

  /** Section headers (Cast, Technical Details, From this Series) */
  heading: scaleSize(32),

  /** Overview, actor names, card titles, metadata */
  body: scaleSize(40),

  /** Secondary text, labels, subtitles */
  callout: scaleSize(26),
};

export type TVTypographyKey = keyof typeof TVTypography;

const scaleMultipliers: Record<TVTypographyScale, number> = {
  [TVTypographyScale.Small]: 0.85,
  [TVTypographyScale.Default]: 1.0,
  [TVTypographyScale.Large]: 1.2,
  [TVTypographyScale.ExtraLarge]: 1.4,
};

/**
 * Hook that returns scaled TV typography values based on user settings.
 * Use this instead of the static TVTypography constant for dynamic scaling.
 */
export const useScaledTVTypography = () => {
  const { settings } = useSettings();
  const scale =
    scaleMultipliers[settings.tvTypographyScale] ??
    scaleMultipliers[TVTypographyScale.Default];

  return {
    display: Math.round(TVTypography.display * scale),
    title: Math.round(TVTypography.title * scale),
    heading: Math.round(TVTypography.heading * scale),
    body: Math.round(TVTypography.body * scale),
    callout: Math.round(TVTypography.callout * scale),
  };
};
