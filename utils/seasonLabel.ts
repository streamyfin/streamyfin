import type { TFunction } from "i18next";

/**
 * A season's name, or "Season N" in the app's language when the server gave it
 * none, as for a season pieced together from its episodes.
 */
export const seasonLabel = (
  t: TFunction,
  name: string | null | undefined,
  index: number | string | null | undefined,
): string => name || t("seerr.season_number", { season_number: index });

/**
 * The name above a TV series page's episode row: the selected season's, or
 * none while the seasons are unknown (loading, or failed) rather than a
 * "Season 1" fallback the series may not have.
 */
export const seasonHeading = (
  t: TFunction,
  seasons: { Name?: string | null; IndexNumber?: number | null }[] | undefined,
  index: number | string,
): string | null => {
  if (seasons === undefined) return null;
  const season = seasons.find(
    (s) => s.IndexNumber === index || s.Name === String(index),
  );
  return seasonLabel(t, season?.Name, index);
};
