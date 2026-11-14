/**
 * Utility functions for querying downloaded series/episode data.
 * Centralizes common filtering patterns to reduce duplication.
 */
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { hashKey, type QueryKey } from "@tanstack/react-query";
import type { DownloadedItem } from "@/providers/Downloads/types";

/** Sort episodes by season then episode number */
const sortByEpisodeOrder = (a: BaseItemDto, b: BaseItemDto) =>
  (a.ParentIndexNumber ?? 0) - (b.ParentIndexNumber ?? 0) ||
  (a.IndexNumber ?? 0) - (b.IndexNumber ?? 0);

/**
 * Get all downloaded episodes for a series, sorted by season and episode number.
 */
export function getDownloadedEpisodesForSeries(
  downloadedItems: DownloadedItem[] | undefined,
  seriesId: string,
): BaseItemDto[] {
  if (!downloadedItems) return [];
  return downloadedItems
    .filter((f) => f.item.SeriesId === seriesId)
    .map((f) => f.item)
    .sort(sortByEpisodeOrder);
}

/**
 * Get downloaded episodes for a specific season of a series.
 */
export function getDownloadedEpisodesForSeason(
  downloadedItems: DownloadedItem[] | undefined,
  seriesId: string,
  seasonNumber: number,
): BaseItemDto[] {
  return getDownloadedEpisodesForSeries(downloadedItems, seriesId).filter(
    (ep) => ep.ParentIndexNumber === seasonNumber,
  );
}

/**
 * Get downloaded episodes by seasonId (for carousel views).
 */
export function getDownloadedEpisodesBySeasonId(
  downloadedItems: DownloadedItem[] | undefined,
  seasonId: string,
): BaseItemDto[] {
  if (!downloadedItems) return [];
  return downloadedItems
    .filter((f) => f.item.Type === "Episode" && f.item.SeasonId === seasonId)
    .map((f) => f.item)
    .sort(sortByEpisodeOrder);
}

/**
 * Get unique season numbers from downloaded episodes for a series.
 */
export function getDownloadedSeasonNumbers(
  downloadedItems: DownloadedItem[] | undefined,
  seriesId: string,
): number[] {
  const episodes = getDownloadedEpisodesForSeries(downloadedItems, seriesId);
  return [
    ...new Set(
      episodes
        .map((ep) => ep.ParentIndexNumber)
        .filter((n): n is number => n != null),
    ),
  ].sort((a, b) => a - b);
}

/**
 * Build fake season objects from downloaded episodes.
 * Useful for offline mode where we don't have actual season data.
 */
export function buildOfflineSeasons(
  downloadedItems: DownloadedItem[] | undefined,
  seriesId: string,
): BaseItemDto[] {
  const episodes = getDownloadedEpisodesForSeries(downloadedItems, seriesId);
  const seasonNumbers = getDownloadedSeasonNumbers(downloadedItems, seriesId);

  return seasonNumbers.map((seasonNum) => {
    const firstEpisode = episodes.find(
      (ep) => ep.ParentIndexNumber === seasonNum,
    );
    return {
      Id: `offline-season-${seasonNum}`,
      IndexNumber: seasonNum,
      // The pages name a season without one at render time (seasonLabel), in
      // the app's language: written here, it would outlive a language change in
      // the seasons query's cache.
      Name: firstEpisode?.SeasonName,
      SeriesId: seriesId,
    } as BaseItemDto;
  });
}

/**
 * Build a series-like object from downloaded episodes.
 * Useful for offline mode where we don't have the actual series data.
 */
export function buildOfflineSeriesFromEpisodes(
  downloadedItems: DownloadedItem[] | undefined,
  seriesId: string,
): BaseItemDto | null {
  const episodes = getDownloadedEpisodesForSeries(downloadedItems, seriesId);
  if (episodes.length === 0) return null;

  const firstEpisode = episodes[0];
  return {
    Id: seriesId,
    Name: firstEpisode.SeriesName,
    Type: "Series",
    ProductionYear: firstEpisode.ProductionYear,
    Overview: firstEpisode.SeriesName,
  } as BaseItemDto;
}

/**
 * The part of a series query's key that follows the downloads. Offline, the
 * page is built from the downloaded episodes, so it must refetch whenever they
 * change. It follows the provider's `refreshKey`, not the item count: a delete
 * and a finished download in one refresh leave the count unchanged. Online,
 * the downloads play no part in the answer: a new key there blanks the page
 * and fetches it again for every episode that finishes.
 */
export function downloadsKeyPart(
  isOffline: boolean,
  refreshKey: number,
): number | null {
  return isOffline ? refreshKey : null;
}

/**
 * `placeholderData` for a series query whose key ends with downloadsKeyPart.
 * Offline, a download refresh moves only that last part, and closing the
 * player is one. The query keeps its previous answer while it reads the
 * downloads again, so the page neither blanks nor remounts for a refresh that
 * may change nothing on it. Any other change of key, another season for one,
 * starts from nothing as before.
 */
export function keepThroughDownloadRefresh(queryKey: QueryKey) {
  const head = hashKey(queryKey.slice(0, -1));
  return <T>(
    previous: T | undefined,
    previousQuery?: { queryKey: QueryKey },
  ): T | undefined =>
    previousQuery && hashKey(previousQuery.queryKey.slice(0, -1)) === head
      ? previous
      : undefined;
}
