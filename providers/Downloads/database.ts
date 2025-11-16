import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { storage } from "@/utils/mmkv";
import type { DownloadedItem, DownloadsDatabase } from "./types";

const DOWNLOADS_DATABASE_KEY = "downloads.v2.json";

/**
 * Get the downloads database from storage
 */
export function getDownloadsDatabase(): DownloadsDatabase {
  const file = storage.getString(DOWNLOADS_DATABASE_KEY);
  if (file) {
    return JSON.parse(file) as DownloadsDatabase;
  }
  return { movies: {}, series: {}, other: {} };
}

/**
 * Save the downloads database to storage
 */
export function saveDownloadsDatabase(db: DownloadsDatabase): void {
  storage.set(DOWNLOADS_DATABASE_KEY, JSON.stringify(db));
}

/**
 * Get all downloaded items as a flat array
 */
export function getAllDownloadedItems(): DownloadedItem[] {
  const db = getDownloadsDatabase();
  const items: DownloadedItem[] = [];

  for (const movie of Object.values(db.movies)) {
    items.push(movie);
  }

  for (const series of Object.values(db.series)) {
    for (const season of Object.values(series.seasons)) {
      for (const episode of Object.values(season.episodes)) {
        items.push(episode);
      }
    }
  }

  if (db.other) {
    for (const item of Object.values(db.other)) {
      items.push(item);
    }
  }

  return items;
}

/**
 * Get a downloaded item by its ID
 */
export function getDownloadedItemById(id: string): DownloadedItem | undefined {
  const db = getDownloadsDatabase();

  if (db.movies[id]) {
    return db.movies[id];
  }

  for (const series of Object.values(db.series)) {
    for (const season of Object.values(series.seasons)) {
      for (const episode of Object.values(season.episodes)) {
        if (episode.item.Id === id) {
          return episode;
        }
      }
    }
  }

  if (db.other?.[id]) {
    return db.other[id];
  }

  return undefined;
}

/**
 * Add a downloaded item to the database
 */
export function addDownloadedItem(item: DownloadedItem): void {
  const db = getDownloadsDatabase();
  const baseItem = item.item;

  if (baseItem.Type === "Movie" && baseItem.Id) {
    db.movies[baseItem.Id] = item;
  } else if (
    baseItem.Type === "Episode" &&
    baseItem.SeriesId &&
    baseItem.ParentIndexNumber !== undefined &&
    baseItem.ParentIndexNumber !== null &&
    baseItem.IndexNumber !== undefined &&
    baseItem.IndexNumber !== null
  ) {
    // Ensure series exists
    if (!db.series[baseItem.SeriesId]) {
      const seriesInfo: Partial<BaseItemDto> = {
        Id: baseItem.SeriesId,
        Name: baseItem.SeriesName,
        Type: "Series",
      };
      db.series[baseItem.SeriesId] = {
        seriesInfo: seriesInfo as BaseItemDto,
        seasons: {},
      };
    }

    // Ensure season exists
    const seasonNumber = baseItem.ParentIndexNumber;
    if (!db.series[baseItem.SeriesId].seasons[seasonNumber]) {
      db.series[baseItem.SeriesId].seasons[seasonNumber] = {
        episodes: {},
      };
    }

    // Add episode
    const episodeNumber = baseItem.IndexNumber;
    db.series[baseItem.SeriesId].seasons[seasonNumber].episodes[episodeNumber] =
      item;
  } else if (baseItem.Id) {
    if (!db.other) db.other = {};
    db.other[baseItem.Id] = item;
  }

  saveDownloadsDatabase(db);
}

/**
 * Remove a downloaded item from the database
 * Returns the removed item if found, undefined otherwise
 */
export function removeDownloadedItem(id: string): DownloadedItem | undefined {
  const db = getDownloadsDatabase();
  let itemToDelete: DownloadedItem | undefined;

  // Check movies
  if (db.movies[id]) {
    itemToDelete = db.movies[id];
    delete db.movies[id];
  } else {
    // Check series episodes
    for (const seriesId in db.series) {
      const series = db.series[seriesId];
      for (const seasonNum in series.seasons) {
        const season = series.seasons[seasonNum];
        for (const episodeNum in season.episodes) {
          const episode = season.episodes[episodeNum];
          if (episode.item.Id === id) {
            itemToDelete = episode;
            delete season.episodes[episodeNum];

            // Clean up empty season
            if (Object.keys(season.episodes).length === 0) {
              delete series.seasons[seasonNum];
            }

            // Clean up empty series
            if (Object.keys(series.seasons).length === 0) {
              delete db.series[seriesId];
            }

            break;
          }
        }
      }
    }

    // Check other items
    if (!itemToDelete && db.other?.[id]) {
      itemToDelete = db.other[id];
      delete db.other[id];
    }
  }

  if (itemToDelete) {
    saveDownloadsDatabase(db);
  }

  return itemToDelete;
}

/**
 * Update a downloaded item in the database
 */
export function updateDownloadedItem(
  _id: string,
  updatedItem: DownloadedItem,
): void {
  const db = getDownloadsDatabase();
  const baseItem = updatedItem.item;

  if (baseItem.Type === "Movie" && baseItem.Id) {
    db.movies[baseItem.Id] = updatedItem;
  } else if (
    baseItem.Type === "Episode" &&
    baseItem.SeriesId &&
    baseItem.ParentIndexNumber !== undefined &&
    baseItem.ParentIndexNumber !== null &&
    baseItem.IndexNumber !== undefined &&
    baseItem.IndexNumber !== null
  ) {
    const seriesId = baseItem.SeriesId;
    const seasonNumber = baseItem.ParentIndexNumber;
    const episodeNumber = baseItem.IndexNumber;

    if (db.series[seriesId]?.seasons[seasonNumber]?.episodes[episodeNumber]) {
      db.series[seriesId].seasons[seasonNumber].episodes[episodeNumber] =
        updatedItem;
    }
  } else if (baseItem.Id && db.other?.[baseItem.Id]) {
    db.other[baseItem.Id] = updatedItem;
  }

  saveDownloadsDatabase(db);
}

/**
 * Clear all downloaded items from the database
 */
export function clearAllDownloadedItems(): void {
  saveDownloadsDatabase({ movies: {}, series: {}, other: {} });
}
