import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";

/**
 * What the series pages remember per series (`seasonIndexAtom`): the index
 * number of the season on screen, or its name when it has no number.
 */
export type RememberedSeason = number | string | null | undefined;

const isRemembered = (season: BaseItemDto, remembered: RememberedSeason) =>
  season.IndexNumber === remembered ||
  season.Name === remembered ||
  season.Name === String(remembered);

/**
 * The season to show instead when the remembered one is no longer among
 * `seasons`. Offline that happens by deleting the last downloaded episode of
 * the season on screen: the season list is built from what is downloaded, so
 * the season goes with it.
 *
 * The next season up is preferred, then the one before, which is where someone
 * working through a series wants to land. A remembered name has no order to go
 * by and falls back to the first season.
 *
 * Returns undefined when nothing has to change: nothing is remembered, the
 * remembered season is still there, or there is no season to move to.
 */
export const replacementSeason = (
  seasons: BaseItemDto[] | undefined,
  remembered: RememberedSeason,
): number | string | undefined => {
  if (remembered === undefined || remembered === null) return undefined;
  if (!seasons?.length) return undefined;
  if (seasons.some((season) => isRemembered(season, remembered))) {
    return undefined;
  }

  let replacement: BaseItemDto | undefined;
  if (typeof remembered === "number") {
    const numbered = seasons
      .filter((season) => typeof season.IndexNumber === "number")
      .sort((a, b) => (a.IndexNumber ?? 0) - (b.IndexNumber ?? 0));
    replacement =
      numbered.find((season) => (season.IndexNumber ?? 0) > remembered) ??
      numbered.at(-1);
  }
  replacement ??= seasons[0];

  return replacement.IndexNumber ?? replacement.Name ?? undefined;
};
