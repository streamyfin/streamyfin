import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import type { NextEpisodesRule } from "./nextEpisodesRules";
import type { DownloadedItem } from "./types";

const isPlayed = (episode: BaseItemDto) => episode.UserData?.Played === true;

/**
 * An episode that belongs in the order a series is watched in. Specials sit
 * outside it, and a missing episode (one the server only knows from metadata)
 * has no file to download.
 */
const isInWatchingOrder = (episode: BaseItemDto) =>
  !!episode.Id &&
  episode.LocationType !== "Virtual" &&
  episode.ParentIndexNumber !== 0;

/**
 * The next `count` unwatched episodes of a series, from the server's list of
 * them. They start after the last watched episode rather than at the first
 * unwatched one: a skipped episode early in the series is not what comes next.
 */
export const nextEpisodes = (
  episodes: BaseItemDto[],
  count: number,
): BaseItemDto[] => {
  const ordered = episodes.filter(isInWatchingOrder);
  let lastPlayed = -1;
  ordered.forEach((episode, index) => {
    if (isPlayed(episode)) lastPlayed = index;
  });
  return ordered.slice(lastPlayed + 1).slice(0, count);
};

/**
 * The server's episodes with the watched state of their downloaded copies,
 * where a copy was played more recently. An episode watched offline reaches
 * the server only when its state is synced, and until then the server still
 * calls it unwatched.
 */
export const withLocalPlayState = (
  episodes: BaseItemDto[],
  downloaded: DownloadedItem[],
): BaseItemDto[] => {
  const local = new Map(
    downloaded.map((download) => [download.item.Id, download.item.UserData]),
  );
  return episodes.map((episode) => {
    const userData = local.get(episode.Id);
    const localPlayed = Date.parse(userData?.LastPlayedDate ?? "");
    const remotePlayed = Date.parse(episode.UserData?.LastPlayedDate ?? "");
    if (
      !userData ||
      Number.isNaN(localPlayed) ||
      (!Number.isNaN(remotePlayed) && localPlayed <= remotePlayed)
    ) {
      return episode;
    }
    return {
      ...episode,
      UserData: {
        ...episode.UserData,
        Played: userData.Played,
        LastPlayedDate: userData.LastPlayedDate,
      },
    };
  });
};

export type NextEpisodesPlan = {
  /** Episodes to download, in watching order. */
  download: BaseItemDto[];
  /** Ids of downloaded episodes to delete. */
  remove: string[];
};

/**
 * What a series rule downloads and deletes. Deleting only ever takes watched
 * episodes, never the one playing, and only those the rule downloaded itself
 * unless `deleteAnyDownload` lets it take the ones downloaded by hand as well.
 */
export const planNextEpisodes = ({
  episodes,
  rule,
  downloadedIds,
  busyIds,
  playingIds,
  deleteAnyDownload,
}: {
  /** Every episode of the series, as the server lists them. */
  episodes: BaseItemDto[];
  rule: NextEpisodesRule;
  downloadedIds: ReadonlySet<string>;
  /** Episodes downloading or waiting to download. */
  busyIds: ReadonlySet<string>;
  playingIds: ReadonlySet<string>;
  deleteAnyDownload: boolean;
}): NextEpisodesPlan => {
  const download = nextEpisodes(episodes, rule.count).filter(
    (episode) => !downloadedIds.has(episode.Id!) && !busyIds.has(episode.Id!),
  );
  if (!rule.deleteWatched) return { download, remove: [] };

  const ownDownloads = new Set(rule.downloadedIds);
  const remove = episodes
    .filter(
      (episode) =>
        !!episode.Id &&
        isPlayed(episode) &&
        downloadedIds.has(episode.Id) &&
        !playingIds.has(episode.Id) &&
        (deleteAnyDownload || ownDownloads.has(episode.Id)),
    )
    .map((episode) => episode.Id!);
  return { download, remove };
};
