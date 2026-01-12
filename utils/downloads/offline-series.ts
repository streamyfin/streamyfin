/**
 * Utility functions for querying downloaded series/episode data.
 * Centralizes common filtering patterns to reduce duplication.
 */
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
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
      Name: firstEpisode?.SeasonName || `Season ${seasonNum}`,
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
