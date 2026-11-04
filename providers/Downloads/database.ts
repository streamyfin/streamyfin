import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { Paths } from "expo-file-system";
import { Platform } from "react-native";
import { storage } from "@/utils/mmkv";
import type { DownloadedItem, DownloadsDatabase } from "./types";
import { rebaseOntoDocuments } from "./utils";

const DOWNLOADS_DATABASE_KEY = "downloads.v2.json";

// Performance optimization: Cache the parsed database to avoid repeated JSON.parse calls
let cachedDb: DownloadsDatabase | null = null;
let cacheVersion = 0;

// Performance optimization: Cache the flattened items array
let cachedItems: DownloadedItem[] | null = null;
let itemsCacheVersion = -1;

// Performance optimization: Index for O(1) item lookups by ID
let itemIndex: Map<string, DownloadedItem> | null = null;
let indexCacheVersion = -1;

/**
 * Points every local file an item stores (the video, the trickplay sheets, the downloaded
 * subtitles) at the Documents directory the app has now. The locations are stored whole, and
 * an iOS app update can move the app's container, which left every download unplayable until
 * it was downloaded again (#2252). Android's files directory never moves, so nothing changes
 * there. Mutates and returns the item.
 */
function withCurrentDocumentPaths(
  item: DownloadedItem,
  documents: string,
): DownloadedItem {
  if (Platform.OS !== "ios") return item;
  if (typeof item.videoFilePath === "string") {
    item.videoFilePath = rebaseOntoDocuments(item.videoFilePath, documents);
  }
  if (typeof item.trickPlayData?.path === "string") {
    item.trickPlayData.path = rebaseOntoDocuments(
      item.trickPlayData.path,
      documents,
    );
  }
  const streams = item.mediaSource?.MediaStreams;
  for (const stream of Array.isArray(streams) ? streams : []) {
    if (typeof stream?.DeliveryUrl === "string") {
      stream.DeliveryUrl = rebaseOntoDocuments(stream.DeliveryUrl, documents);
    }
  }
  return item;
}

/**
 * Fills in the sections an older or damaged stored database lacks, so every reader and writer
 * below can rely on them, and drops the entries that are not downloads at all. Mutates and
 * returns the database.
 */
function withAllSections(db: Partial<DownloadsDatabase>): DownloadsDatabase {
  const isObject = (entry: unknown): entry is Record<string, unknown> =>
    !!entry && typeof entry === "object";
  // A download carries the item it describes; the lookups index it by that item's id.
  const isDownload = (entry: unknown) =>
    isObject(entry) && isObject(entry.item);
  const keep = <T>(
    entries: Record<string, T> | undefined,
    test: (entry: unknown) => boolean,
  ) =>
    Object.fromEntries(
      Object.entries(entries ?? {}).filter(([, entry]) => test(entry)),
    ) as Record<string, T>;

  db.movies = keep(db.movies, isDownload);
  db.other = keep(db.other, isDownload);
  db.series = keep(db.series, isObject);
  for (const series of Object.values(db.series)) {
    series.seasons = keep(series.seasons, isObject);
    for (const season of Object.values(series.seasons)) {
      season.episodes = keep(season.episodes, isDownload);
    }
  }
  return db as DownloadsDatabase;
}

function forEachItem(
  db: DownloadsDatabase,
  visit: (item: DownloadedItem) => void,
): void {
  for (const movie of Object.values(db.movies)) visit(movie);
  for (const series of Object.values(db.series)) {
    for (const season of Object.values(series.seasons)) {
      for (const episode of Object.values(season.episodes)) visit(episode);
    }
  }
  for (const item of Object.values(db.other ?? {})) visit(item);
}

/**
 * Get the downloads database from storage
 * PERFORMANCE: Caches the parsed database to avoid repeated JSON.parse calls.
 * NOTE: Returns the shared cached instance — do NOT mutate it directly. Go
 * through addDownloadedItem/updateDownloadedItem/removeDownloadedItem so
 * saveDownloadsDatabase() runs and the derived caches stay consistent.
 */
export function getDownloadsDatabase(): DownloadsDatabase {
  // Return cached database if available
  if (cachedDb !== null) {
    return cachedDb;
  }

  // Parse from storage and cache the result
  const file = storage.getString(DOWNLOADS_DATABASE_KEY);
  if (file) {
    const db = withAllSections(JSON.parse(file));
    const documents = Paths.document.uri;
    forEachItem(db, (item) => withCurrentDocumentPaths(item, documents));
    cachedDb = db;
    return cachedDb;
  }

  const emptyDb = { movies: {}, series: {}, other: {} };
  cachedDb = emptyDb;
  return emptyDb;
}

/**
 * Save the downloads database to storage
 * PERFORMANCE: Updates cache and invalidates derived caches
 */
export function saveDownloadsDatabase(db: DownloadsDatabase): void {
  storage.set(DOWNLOADS_DATABASE_KEY, JSON.stringify(db));
  // Update the cache with the new database
  cachedDb = db;
  // Invalidate derived caches (items array and index)
  cachedItems = null;
  itemIndex = null;
  cacheVersion++;
}

/**
 * Get all downloaded items as a flat array
 * PERFORMANCE: Caches the flattened array to avoid rebuilding on every call
 */
export function getAllDownloadedItems(): DownloadedItem[] {
  // Return cached items if available and up-to-date
  if (cachedItems !== null && itemsCacheVersion === cacheVersion) {
    return cachedItems;
  }

  // Build the items array from the database
  const db = getDownloadsDatabase();
  const items: DownloadedItem[] = [];
  forEachItem(db, (item) => items.push(item));

  // Cache the result
  cachedItems = items;
  itemsCacheVersion = cacheVersion;

  return items;
}

/**
 * Build or refresh the item index for O(1) lookups
 */
function ensureItemIndex(): void {
  if (itemIndex !== null && indexCacheVersion === cacheVersion) {
    return; // Index is up-to-date
  }

  // Build new index from all items
  itemIndex = new Map<string, DownloadedItem>();
  const items = getAllDownloadedItems();

  for (const item of items) {
    if (item.item.Id) {
      itemIndex.set(item.item.Id, item);
    }
  }

  indexCacheVersion = cacheVersion;
}

/**
 * Get a downloaded item by its ID
 * PERFORMANCE: Uses O(1) index lookup instead of O(n²) iteration
 */
export function getDownloadedItemById(id: string): DownloadedItem | undefined {
  ensureItemIndex();
  return itemIndex!.get(id);
}

/**
 * Add a downloaded item to the database
 */
export function addDownloadedItem(item: DownloadedItem): void {
  const db = getDownloadsDatabase();
  const baseItem = item.item;
  // A download that finishes after an update still carries the paths it was started with.
  withCurrentDocumentPaths(item, Paths.document.uri);

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
  // saveDownloadsDatabase already invalidates caches
}
