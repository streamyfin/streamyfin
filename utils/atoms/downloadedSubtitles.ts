/**
 * Downloaded Subtitles Storage
 *
 * Persists metadata about client-side downloaded subtitles (from OpenSubtitles).
 * Subtitle files are stored in Paths.cache/streamyfin-subtitles/ directory.
 * Filenames are prefixed with itemId for organization: {itemId}_{filename}
 *
 * While files are in cache, metadata is persisted in MMKV so subtitles survive
 * app restarts (unless cache is manually cleared by the user).
 *
 * TV platform only.
 */

import { storage } from "../mmkv";

// MMKV storage key
const DOWNLOADED_SUBTITLES_KEY = "downloadedSubtitles.json";

/**
 * Metadata for a downloaded subtitle file
 */
export interface DownloadedSubtitle {
  /** Unique identifier (uuid) */
  id: string;
  /** Jellyfin item ID */
  itemId: string;
  /** Local file path in documents directory */
  filePath: string;
  /** Display name */
  name: string;
  /** 3-letter language code */
  language: string;
  /** File format (srt, ass, etc.) */
  format: string;
  /** Source provider */
  source: "opensubtitles";
  /** Unix timestamp when downloaded */
  downloadedAt: number;
}

/**
 * Storage structure for downloaded subtitles
 */
interface DownloadedSubtitlesStorage {
  /** Map of itemId to array of downloaded subtitles */
  byItemId: Record<string, DownloadedSubtitle[]>;
}

/**
 * Load the storage from MMKV
 */
function loadStorage(): DownloadedSubtitlesStorage {
  try {
    const data = storage.getString(DOWNLOADED_SUBTITLES_KEY);
    if (data) {
      return JSON.parse(data) as DownloadedSubtitlesStorage;
    }
  } catch {
    // Ignore parse errors, return empty storage
  }
  return { byItemId: {} };
}

/**
 * Save the storage to MMKV
 */
function saveStorage(data: DownloadedSubtitlesStorage): void {
  try {
    storage.set(DOWNLOADED_SUBTITLES_KEY, JSON.stringify(data));
  } catch (error) {
    console.error("Failed to save downloaded subtitles:", error);
  }
}

/**
 * Get all downloaded subtitles for a specific Jellyfin item
 */
export function getSubtitlesForItem(itemId: string): DownloadedSubtitle[] {
  const data = loadStorage();
  return data.byItemId[itemId] ?? [];
}

/**
 * Add a downloaded subtitle to storage
 */
export function addDownloadedSubtitle(subtitle: DownloadedSubtitle): void {
  const data = loadStorage();

  // Initialize array for item if it doesn't exist
  if (!data.byItemId[subtitle.itemId]) {
    data.byItemId[subtitle.itemId] = [];
  }

  // Check if subtitle with same id already exists and update it
  const existingIndex = data.byItemId[subtitle.itemId].findIndex(
    (s) => s.id === subtitle.id,
  );

  if (existingIndex !== -1) {
    // Update existing entry
    data.byItemId[subtitle.itemId][existingIndex] = subtitle;
  } else {
    // Add new entry
    data.byItemId[subtitle.itemId].push(subtitle);
  }

  saveStorage(data);
}

/**
 * Remove a downloaded subtitle from storage
 */
export function removeDownloadedSubtitle(
  itemId: string,
  subtitleId: string,
): void {
  const data = loadStorage();

  if (data.byItemId[itemId]) {
    data.byItemId[itemId] = data.byItemId[itemId].filter(
      (s) => s.id !== subtitleId,
    );

    // Clean up empty arrays
    if (data.byItemId[itemId].length === 0) {
      delete data.byItemId[itemId];
    }

    saveStorage(data);
  }
}

/**
 * Remove all downloaded subtitles for a specific item
 */
export function removeAllSubtitlesForItem(itemId: string): void {
  const data = loadStorage();

  if (data.byItemId[itemId]) {
    delete data.byItemId[itemId];
    saveStorage(data);
  }
}

/**
 * Check if a subtitle file already exists for an item by language
 */
export function hasSubtitleForLanguage(
  itemId: string,
  language: string,
): boolean {
  const subtitles = getSubtitlesForItem(itemId);
  return subtitles.some((s) => s.language === language);
}

/**
 * Get all downloaded subtitles across all items
 */
export function getAllDownloadedSubtitles(): DownloadedSubtitle[] {
  const data = loadStorage();
  return Object.values(data.byItemId).flat();
}
