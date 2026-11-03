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
