import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import type { TFunction } from "i18next";
import { seasonLabel } from "@/utils/seasonLabel";

/** "Episode N" in the app's language. */
export const episodeNumberLabel = (
  t: TFunction,
  index: number | null | undefined,
): string => t("item_card.episode_number", { episode_number: index });

/**
 * The line the players show above an episode's title: its series, its season
 * (named from its number when the episode carries no season name) and its
 * number.
 */
export const episodeSubtitle = (
  t: TFunction,
  episode: Pick<
    BaseItemDto,
    "SeriesName" | "SeasonName" | "ParentIndexNumber" | "IndexNumber"
  >,
): string =>
  `${episode.SeriesName} - ${seasonLabel(
    t,
    episode.SeasonName,
    episode.ParentIndexNumber,
  )} ${episodeNumberLabel(t, episode.IndexNumber)}`;
