import type { Api } from "@jellyfin/sdk";
import type {
  NativePlayerEpisodeListItem,
  NativePlayerNextEpisode,
} from "@/modules/mpv-player/src/NativePlayerPresentation.types";
import { getPrimaryImageUrl } from "@/utils/jellyfin/image/getPrimaryImageUrl";
import type { SeriesEpisode } from "./seriesEpisodes";

const neighbourOf = <T extends { id: string }>(
  episodes: readonly T[],
  currentId: string | null,
  step: 1 | -1,
): T | null => {
  const index =
    currentId === null ? -1 : episodes.findIndex(({ id }) => id === currentId);
  if (index < 0) return null;
  return episodes[index + step] ?? null;
};

/** The episode after the one the TV plays; none past the last, nor for an item the list does not hold. */
export const episodeAfter = <T extends { id: string }>(
  episodes: readonly T[],
  currentId: string | null,
): T | null => neighbourOf(episodes, currentId, 1);

/** The episode before the one the TV plays; none ahead of the first, nor for an item the list does not hold. */
export const episodeBefore = <T extends { id: string }>(
  episodes: readonly T[],
  currentId: string | null,
): T | null => neighbourOf(episodes, currentId, -1);

/** The series as the remote screen lists it, its previous and next buttons reading it too. */
export const remoteEpisodeList = (
  api: Api,
  episodes: readonly SeriesEpisode[],
  currentId: string,
): NativePlayerEpisodeListItem[] =>
  episodes.map(({ id, item }) => ({
    itemId: id,
    title: item.Name ?? "",
    indexNumber: item.IndexNumber ?? undefined,
    imageUrl:
      getPrimaryImageUrl({ api, item, quality: 80, width: 300 }) ?? undefined,
    progressPercent: item.UserData?.PlayedPercentage ?? 0,
    isCurrent: id === currentId,
  }));

/** What comes after the list sent, for the card at its end: no countdown, the TV has stopped by then. */
export const remoteNextUp = (
  api: Api,
  episode: SeriesEpisode | undefined,
): NativePlayerNextEpisode | null =>
  episode
    ? {
        itemId: episode.id,
        title: episode.item.Name ?? "",
        imageUrl:
          getPrimaryImageUrl({ api, item: episode.item, quality: 80 }) ??
          undefined,
        countdownSeconds: 0,
      }
    : null;
