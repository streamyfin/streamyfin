/** How a Seerr page writes a date: "May 1, 2024". */
export const SEERR_DATE_FORMAT: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "long",
  day: "numeric",
};

const canonical = (tag: string): string | undefined => {
  try {
    return Intl.getCanonicalLocales(tag)[0];
  } catch {
    return undefined;
  }
};

/**
 * The tag Seerr's dates and amounts are formatted with: the Seerr user's
 * language with their region, or the language alone when it names its own
 * region, as pt-BR does. Undefined when neither makes a tag, which leaves the
 * device's own.
 */
export const seerrLocaleTag = (
  locale: string,
  region: string,
): string | undefined =>
  locale.includes("-")
    ? canonical(locale)
    : (canonical(`${locale}-${region}`) ?? canonical(locale));

/**
 * A date from Seerr, written out. Seerr's dates are days, not moments:
 * "2024-05-01" reads as midnight UTC, so it is shown in UTC, as Seerr does,
 * or it falls on the day before anywhere west of UTC.
 */
export const formatSeerrDate = (
  date: string | null | undefined,
  tag: string | undefined,
  format: Intl.DateTimeFormatOptions = SEERR_DATE_FORMAT,
): string | undefined => {
  if (!date) return undefined;
  const day = new Date(date);
  if (Number.isNaN(day.getTime())) return undefined;
  return day.toLocaleDateString(tag, { ...format, timeZone: "UTC" });
};
