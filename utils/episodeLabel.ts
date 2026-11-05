import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import type { TFunction } from "i18next";
import { seasonLabel } from "@/utils/seasonLabel";

/** "Episode N" in the app's language, nothing for an episode without a number. */
export const episodeNumberLabel = (
  t: TFunction,
  index: number | null | undefined,
): string =>
  index === null || index === undefined
    ? ""
    : t("item_card.episode_number", { episode_number: index });

/**
 * The line the players show above an episode's title: its series, its season
 * (named from its number when the episode carries no season name) and its
 * number, each left out when the episode does not have it.
 */
export const episodeSubtitle = (
  t: TFunction,
  episode: Pick<
    BaseItemDto,
    "SeriesName" | "SeasonName" | "ParentIndexNumber" | "IndexNumber"
  >,
): string => {
  const hasSeason =
    !!episode.SeasonName ||
    (episode.ParentIndexNumber !== null &&
      episode.ParentIndexNumber !== undefined);
  const where = [
    hasSeason
      ? seasonLabel(t, episode.SeasonName, episode.ParentIndexNumber)
      : "",
    episodeNumberLabel(t, episode.IndexNumber),
  ]
    .filter(Boolean)
    .join(" ");
  const series = episode.SeriesName ?? "";
  if (!where) return series;
  return series ? `${series} - ${where}` : where;
};
