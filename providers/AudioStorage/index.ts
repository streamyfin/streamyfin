/**
 * Audio Storage Module
 *
 * Unified storage manager for audio files supporting:
 * - Look-ahead cache (auto-managed, ephemeral, stored in cache directory)
 * - Future: Full music downloads (user-initiated, permanent, stored in documents)
 *
 * getLocalPath() checks permanent storage first, then cache.
 */

import { EventEmitter } from "eventemitter3";
import { Directory, File, Paths } from "expo-file-system";
import type { EventSubscription } from "expo-modules-core";
import type {
  DownloadCompleteEvent as BGDownloadCompleteEvent,
  DownloadErrorEvent as BGDownloadErrorEvent,
} from "@/modules";
import { BackgroundDownloader } from "@/modules";
import { storage } from "@/utils/mmkv";
import type {
  AudioStorageIndex,
  DownloadCompleteEvent,
  DownloadErrorEvent,
  DownloadOptions,
  StoredTrackInfo,
} from "./types";

// Storage keys
const AUDIO_STORAGE_INDEX_KEY = "audio_storage.v1.json";

// Directory names
const AUDIO_CACHE_DIR = "streamyfin-audio-cache";
const AUDIO_PERMANENT_DIR = "streamyfin-audio";

// Default limits
const DEFAULT_MAX_CACHE_TRACKS = 10;
const DEFAULT_MAX_CACHE_SIZE_BYTES = 100 * 1024 * 1024; // 100MB

// Event emitter for notifying about download completion
class AudioStorageEventEmitter extends EventEmitter<{
  complete: (event: DownloadCompleteEvent) => void;
  error: (event: DownloadErrorEvent) => void;
}> {}

export const audioStorageEvents = new AudioStorageEventEmitter();

// Track active downloads: taskId -> { itemId, permanent }
const activeDownloads = new Map<
  number,
  { itemId: string; permanent: boolean }
>();

// Track items being downloaded by itemId for quick lookup
const downloadingItems = new Set<string>();

// Track permanent downloads separately for UI indicator
const permanentDownloadingItems = new Set<string>();

// Cached index (loaded from storage on init)
let storageIndex: AudioStorageIndex | null = null;

// Directories (initialized on first use)
let cacheDir: Directory | null = null;
let permanentDir: Directory | null = null;

// Event listener subscriptions (for cleanup)
let _completeSubscription: EventSubscription | null = null;
let _errorSubscription: EventSubscription | null = null;
let listenersSetup = false;

/**
 * Get the storage index from MMKV
 */
function getStorageIndex(): AudioStorageIndex {
  if (storageIndex) {
    return storageIndex;
  }

  try {
    const data = storage.getString(AUDIO_STORAGE_INDEX_KEY);
    if (data) {
      storageIndex = JSON.parse(data) as AudioStorageIndex;
      return storageIndex;
    }
  } catch {
    // Ignore parse errors
  }

  storageIndex = {
    tracks: {},
    totalCacheSize: 0,
    totalPermanentSize: 0,
  };
  return storageIndex;
}

/**
 * Save the storage index to MMKV
 */
function saveStorageIndex(): void {
  if (storageIndex) {
    try {
      storage.set(AUDIO_STORAGE_INDEX_KEY, JSON.stringify(storageIndex));
    } catch {
      // Ignore save errors
    }
  }
}

/**
 * Ensure directories exist
 */
async function ensureDirectories(): Promise<void> {
  try {
    if (!cacheDir) {
      cacheDir = new Directory(Paths.cache, AUDIO_CACHE_DIR);
      if (!cacheDir.exists) {
        await cacheDir.create();
      }
    }

    if (!permanentDir) {
      permanentDir = new Directory(Paths.document, AUDIO_PERMANENT_DIR);
      if (!permanentDir.exists) {
        await permanentDir.create();
      }
    }
  } catch (error) {
    console.warn("[AudioStorage] Failed to create directories:", error);
  }
}

/**
 * Initialize audio storage - call this on app startup
 */
export async function initAudioStorage(): Promise<void> {
  console.log("[AudioStorage] Initializing...");
  try {
    await ensureDirectories();
    getStorageIndex();
    setupEventListeners();
    console.log("[AudioStorage] Initialization complete");
  } catch (error) {
    console.warn("[AudioStorage] Initialization error:", error);
  }
}

/**
 * Set up BackgroundDownloader event listeners
 * Safe to call multiple times - will only set up once
 */
function setupEventListeners(): void {
  // Prevent duplicate listeners
  if (listenersSetup) return;
  listenersSetup = true;

  try {
    console.log("[AudioStorage] Setting up event listeners...");

    _completeSubscription = BackgroundDownloader.addCompleteListener(
      (event: BGDownloadCompleteEvent) => {
        console.log(
          `[AudioStorage] Complete event received: taskId=${event.taskId}, activeDownloads=${JSON.stringify([...activeDownloads.entries()])}`,
        );
        const downloadInfo = activeDownloads.get(event.taskId);
        if (!downloadInfo) {
          console.log(
            `[AudioStorage] Ignoring complete event for unknown taskId: ${event.taskId}`,
          );
          return; // Not an audio download
        }

        handleDownloadComplete(event, downloadInfo);
      },
    );

    _errorSubscription = BackgroundDownloader.addErrorListener(
      (event: BGDownloadErrorEvent) => {
        console.log(
          `[AudioStorage] Error event received: taskId=${event.taskId}, error=${event.error}`,
        );
        const downloadInfo = activeDownloads.get(event.taskId);
        if (!downloadInfo) return; // Not an audio download

        handleDownloadError(event, downloadInfo);
      },
    );

    console.log("[AudioStorage] Event listeners set up successfully");
  } catch (error) {
    console.warn("[AudioStorage] Failed to setup event listeners:", error);
    listenersSetup = false;
  }
}

/**
 * Handle download completion
 */
async function handleDownloadComplete(
  event: BGDownloadCompleteEvent,
  downloadInfo: { itemId: string; permanent: boolean },
): Promise<void> {
  const { itemId, permanent } = downloadInfo;

  try {
    const file = new File(`file://${event.filePath}`);
    const fileInfo = file.info();
    const size = fileInfo.size || 0;

    const index = getStorageIndex();

    // Add to index
    const trackInfo: StoredTrackInfo = {
      itemId,
      localPath: event.filePath,
      size,
      storedAt: Date.now(),
      permanent,
    };

    index.tracks[itemId] = trackInfo;

    if (permanent) {
      index.totalPermanentSize += size;
    } else {
      index.totalCacheSize += size;
    }

    saveStorageIndex();

    console.log(
      `[AudioStorage] Downloaded ${itemId} (${(size / 1024 / 1024).toFixed(1)}MB, permanent=${permanent})`,
    );

    // Emit completion event
    audioStorageEvents.emit("complete", {
      itemId,
      localPath: event.filePath,
      permanent,
    });

    // Clean up tracking
    activeDownloads.delete(event.taskId);
    downloadingItems.delete(itemId);
    permanentDownloadingItems.delete(itemId);

    // Evict old cache if needed (only for cache downloads)
    if (!permanent) {
      evictCacheIfNeeded().catch(() => {
        // Ignore eviction errors
      });
    }
  } catch (error) {
    console.error(`[AudioStorage] Error handling download complete:`, error);
    activeDownloads.delete(event.taskId);
    downloadingItems.delete(itemId);
    permanentDownloadingItems.delete(itemId);
  }
}

/**
 * Handle download error
 */
function handleDownloadError(
  event: BGDownloadErrorEvent,
  downloadInfo: { itemId: string; permanent: boolean },
): void {
  const { itemId } = downloadInfo;

  console.error(`[AudioStorage] Download failed for ${itemId}:`, event.error);

  audioStorageEvents.emit("error", {
    itemId,
    error: event.error,
  });

  activeDownloads.delete(event.taskId);
  downloadingItems.delete(itemId);
  permanentDownloadingItems.delete(itemId);
}

/**
 * Get the local file path for a track if it exists
 * Checks permanent storage first, then cache
 * Returns the path WITH file:// prefix for TrackPlayer
 */
export function getLocalPath(itemId: string | undefined): string | null {
  if (!itemId) return null;

  try {
    const index = getStorageIndex();
    const info = index.tracks[itemId];

    if (info) {
      // Verify file still exists (File constructor needs file:// URI)
      try {
        const fileUri = info.localPath.startsWith("file://")
          ? info.localPath
          : `file://${info.localPath}`;
        const file = new File(fileUri);
        if (file.exists) {
          // Return the URI with file:// prefix for TrackPlayer
          return fileUri;
        }
      } catch {
        // File doesn't exist, remove from index
        if (info.permanent) {
          index.totalPermanentSize -= info.size;
        } else {
          index.totalCacheSize -= info.size;
        }
        delete index.tracks[itemId];
        saveStorageIndex();
      }
    }
  } catch {
    // Ignore errors
  }

  return null;
}

/**
 * Check if a track is currently being downloaded (any type)
 */
export function isDownloading(itemId: string | undefined): boolean {
  if (!itemId) return false;
  return downloadingItems.has(itemId);
}

/**
 * Check if a track is currently being permanently downloaded (user-initiated)
 * Use this for UI indicators - we don't want to show spinners for auto-caching
 */
export function isPermanentDownloading(itemId: string | undefined): boolean {
  if (!itemId) return false;
  return permanentDownloadingItems.has(itemId);
}

/**
 * Check if a track is permanently downloaded (not just cached)
 */
export function isPermanentlyDownloaded(itemId: string | undefined): boolean {
  if (!itemId) return false;

  try {
    const index = getStorageIndex();
    const info = index.tracks[itemId];

    if (info?.permanent) {
      // Verify file still exists
      try {
        const fileUri = info.localPath.startsWith("file://")
          ? info.localPath
          : `file://${info.localPath}`;
        const file = new File(fileUri);
        if (file.exists) {
          return true;
        }
      } catch {
        // File doesn't exist
      }
    }
  } catch {
    // Ignore errors
  }

  return false;
}

/**
 * Check if a track is cached (not permanently downloaded)
 */
export function isCached(itemId: string | undefined): boolean {
  if (!itemId) return false;

  try {
    const index = getStorageIndex();
    const info = index.tracks[itemId];

    if (info && !info.permanent) {
      // Verify file still exists
      try {
        const fileUri = info.localPath.startsWith("file://")
          ? info.localPath
          : `file://${info.localPath}`;
        const file = new File(fileUri);
        if (file.exists) {
          return true;
        }
      } catch {
        // File doesn't exist
      }
    }
  } catch {
    // Ignore errors
  }

  return false;
}

/**
 * Download a track to storage
 * @param itemId - Jellyfin item ID
 * @param url - Stream URL to download from
 * @param options - Download options (permanent: true for user downloads, false for cache)
 */
export async function downloadTrack(
  itemId: string,
  url: string,
  options: DownloadOptions = { permanent: false },
): Promise<void> {
  const { permanent } = options;

  // Skip if already downloading
  if (isDownloading(itemId)) {
    return;
  }

  // Skip if already permanently downloaded
  if (isPermanentlyDownloaded(itemId)) {
    return;
  }

  // If requesting permanent download and file is only cached, delete cached version first
  if (permanent && isCached(itemId)) {
    console.log(
      `[AudioStorage] Upgrading cached track to permanent: ${itemId}`,
    );
    await deleteTrack(itemId);
  }

  // Skip if already cached and not requesting permanent
  if (!permanent && getLocalPath(itemId)) {
    return;
  }

  // Ensure listeners are set up
  setupEventListeners();

  await ensureDirectories();

  const targetDir = permanent ? permanentDir : cacheDir;

  if (!targetDir) {
    console.warn("[AudioStorage] Target directory not initialized");
    return;
  }

  // Use .m4a extension - compatible with iOS/Android and most audio formats
  const filename = `${itemId}.m4a`;
  const destinationPath = `${targetDir.uri}/${filename}`.replace("file://", "");

  console.log(
    `[AudioStorage] Starting download: ${itemId} (permanent=${permanent})`,
  );

  try {
    downloadingItems.add(itemId);
    if (permanent) {
      permanentDownloadingItems.add(itemId);
    }
    const taskId = await BackgroundDownloader.startDownload(
      url,
      destinationPath,
    );
    activeDownloads.set(taskId, { itemId, permanent });
    console.log(
      `[AudioStorage] Download started with taskId=${taskId}, tracking ${activeDownloads.size} downloads`,
    );
  } catch (error) {
    console.error(`[AudioStorage] Failed to start download:`, error);
    downloadingItems.delete(itemId);
    permanentDownloadingItems.delete(itemId);
  }
}

/**
 * Cancel a download in progress
 */
export function cancelDownload(itemId: string): void {
  for (const [taskId, info] of activeDownloads.entries()) {
    if (info.itemId === itemId) {
      try {
        BackgroundDownloader.cancelDownload(taskId);
      } catch {
        // Ignore cancel errors
      }
      activeDownloads.delete(taskId);
      downloadingItems.delete(itemId);
      permanentDownloadingItems.delete(itemId);
      console.log(`[AudioStorage] Cancelled download: ${itemId}`);
      break;
    }
  }
}

/**
 * Delete a stored track
 */
export async function deleteTrack(itemId: string): Promise<void> {
  const index = getStorageIndex();
  const info = index.tracks[itemId];

  if (!info) return;

  try {
    const file = new File(info.localPath);
    if (file.exists) {
      await file.delete();
    }
  } catch (error) {
    console.warn(`[AudioStorage] Failed to delete file:`, error);
  }

  if (info.permanent) {
    index.totalPermanentSize -= info.size;
  } else {
    index.totalCacheSize -= info.size;
  }
  delete index.tracks[itemId];
  saveStorageIndex();

  console.log(`[AudioStorage] Deleted track: ${itemId}`);
}

/**
 * Evict old cache entries if limits are exceeded
 */
async function evictCacheIfNeeded(
  maxTracks: number = DEFAULT_MAX_CACHE_TRACKS,
  maxSizeBytes: number = DEFAULT_MAX_CACHE_SIZE_BYTES,
): Promise<void> {
  const index = getStorageIndex();

  // Get all cache entries sorted by storedAt (oldest first)
  const cacheEntries = Object.values(index.tracks)
    .filter((t) => !t.permanent)
    .sort((a, b) => a.storedAt - b.storedAt);

  // Evict if over track limit or size limit
  while (
    cacheEntries.length > maxTracks ||
    index.totalCacheSize > maxSizeBytes
  ) {
    const oldest = cacheEntries.shift();
    if (!oldest) break;

    console.log(
      `[AudioStorage] Evicting cache entry: ${oldest.itemId} (${(oldest.size / 1024 / 1024).toFixed(1)}MB)`,
    );

    try {
      const file = new File(oldest.localPath);
      if (file.exists) {
        await file.delete();
      }
    } catch {
      // Ignore deletion errors
    }

    index.totalCacheSize -= oldest.size;
    delete index.tracks[oldest.itemId];
  }

  saveStorageIndex();
}

/**
 * Clear all cached tracks (keeps permanent downloads)
 */
export async function clearCache(): Promise<void> {
  const index = getStorageIndex();

  const cacheEntries = Object.values(index.tracks).filter((t) => !t.permanent);

  for (const entry of cacheEntries) {
    try {
      const file = new File(entry.localPath);
      if (file.exists) {
        await file.delete();
      }
    } catch {
      // Ignore deletion errors
    }
    delete index.tracks[entry.itemId];
  }

  index.totalCacheSize = 0;
  saveStorageIndex();

  console.log(`[AudioStorage] Cache cleared`);
}

/**
 * Clear all permanent downloads (keeps cache)
 */
export async function clearPermanentDownloads(): Promise<void> {
  const index = getStorageIndex();

  const permanentEntries = Object.values(index.tracks).filter(
    (t) => t.permanent,
  );

  for (const entry of permanentEntries) {
    try {
      const fileUri = entry.localPath.startsWith("file://")
        ? entry.localPath
        : `file://${entry.localPath}`;
      const file = new File(fileUri);
      if (file.exists) {
        await file.delete();
      }
    } catch {
      // Ignore deletion errors
    }
    delete index.tracks[entry.itemId];
  }

  index.totalPermanentSize = 0;
  saveStorageIndex();

  console.log(`[AudioStorage] Permanent downloads cleared`);
}

/**
 * Get storage statistics
 */
export function getStorageStats(): {
  cacheCount: number;
  cacheSize: number;
  permanentCount: number;
  permanentSize: number;
} {
  const index = getStorageIndex();
  const entries = Object.values(index.tracks);

  return {
    cacheCount: entries.filter((t) => !t.permanent).length,
    cacheSize: index.totalCacheSize,
    permanentCount: entries.filter((t) => t.permanent).length,
    permanentSize: index.totalPermanentSize,
  };
}
