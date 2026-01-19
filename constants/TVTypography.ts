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
