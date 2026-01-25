import { TVTypographyScale, useSettings } from "@/utils/atoms/settings";

/**
 * TV Typography Scale
 *
 * Consistent text sizes for TV interface components.
 * These sizes are optimized for TV viewing distance.
 */

export const TVTypography = {
  /** Hero titles, movie/show names - 70px */
  display: 70,

  /** Episode series name, major headings - 42px */
  title: 42,

  /** Section headers (Cast, Technical Details, From this Series) - 32px */
  heading: 32,

  /** Overview, actor names, card titles, metadata - 20px */
  body: 20,

  /** Secondary text, labels, subtitles - 16px */
  callout: 16,
} as const;

export type TVTypographyKey = keyof typeof TVTypography;

const scaleMultipliers: Record<TVTypographyScale, number> = {
  [TVTypographyScale.Small]: 0.85,
  [TVTypographyScale.Default]: 1.0,
  [TVTypographyScale.Large]: 1.15,
  [TVTypographyScale.ExtraLarge]: 1.3,
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
