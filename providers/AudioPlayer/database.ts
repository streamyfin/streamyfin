import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { storage } from "@/utils/mmkv";
import type {
  AudioDownloadsDatabase,
  DownloadedAlbum,
  DownloadedArtist,
  DownloadedAudioItem,
  TrackPlayStats,
} from "./types";

const AUDIO_DOWNLOADS_KEY = "audio.downloads.v1.json";
const AUDIO_PLAY_STATS_KEY = "audio.playstats.v1.json";

/**
 * Get the audio downloads database from storage
 */
export function getAudioDownloadsDatabase(): AudioDownloadsDatabase {
  const file = storage.getString(AUDIO_DOWNLOADS_KEY);
  if (file) {
    return JSON.parse(file) as AudioDownloadsDatabase;
  }
  return { albums: {}, artists: {}, tracks: {} };
}

/**
 * Save the audio downloads database to storage
 */
export function saveAudioDownloadsDatabase(db: AudioDownloadsDatabase): void {
  storage.set(AUDIO_DOWNLOADS_KEY, JSON.stringify(db));
}

/**
 * Get all downloaded audio items as a flat array
 */
export function getAllDownloadedAudioItems(): DownloadedAudioItem[] {
  const db = getAudioDownloadsDatabase();
  const items: DownloadedAudioItem[] = [];

  // Get standalone tracks
  for (const track of Object.values(db.tracks)) {
    items.push(track);
  }

  // Get tracks from albums
  for (const album of Object.values(db.albums)) {
    for (const track of Object.values(album.tracks)) {
      items.push(track);
    }
  }

  // Get tracks from artists
  for (const artist of Object.values(db.artists)) {
    for (const album of Object.values(artist.albums)) {
      for (const track of Object.values(album.tracks)) {
        items.push(track);
      }
    }
  }

  return items;
}

/**
 * Get a downloaded audio item by its ID
 */
export function getDownloadedAudioById(
  id: string,
): DownloadedAudioItem | undefined {
  const db = getAudioDownloadsDatabase();

  // Check standalone tracks
  if (db.tracks[id]) {
    return db.tracks[id];
  }

  // Check albums
  for (const album of Object.values(db.albums)) {
    if (album.tracks[id]) {
      return album.tracks[id];
    }
  }

  // Check artists
  for (const artist of Object.values(db.artists)) {
    for (const album of Object.values(artist.albums)) {
      if (album.tracks[id]) {
        return album.tracks[id];
      }
    }
  }

  return undefined;
}

/**
 * Get a downloaded album by its ID
 */
export function getDownloadedAlbumById(
  id: string,
): DownloadedAlbum | undefined {
  const db = getAudioDownloadsDatabase();

  // Check standalone albums
  if (db.albums[id]) {
    return db.albums[id];
  }

  // Check artists
  for (const artist of Object.values(db.artists)) {
    if (artist.albums[id]) {
      return artist.albums[id];
    }
  }

  return undefined;
}

/**
 * Get a downloaded artist by its ID
 */
export function getDownloadedArtistById(
  id: string,
): DownloadedArtist | undefined {
  const db = getAudioDownloadsDatabase();
  return db.artists[id];
}

/**
 * Add a downloaded track to the database
 */
export function addDownloadedTrack(
  track: DownloadedAudioItem,
  albumId?: string,
  artistId?: string,
): void {
  const db = getAudioDownloadsDatabase();
  const trackId = track.item.Id;

  if (!trackId) return;

  if (artistId && albumId) {
    // Add to artist > album > track hierarchy
    ensureArtistExists(db, artistId, track.item);
    ensureAlbumExistsInArtist(db, artistId, albumId, track.item);
    db.artists[artistId].albums[albumId].tracks[trackId] = track;
    updateArtistSize(db, artistId);
  } else if (albumId) {
    // Add to album > track hierarchy
    ensureAlbumExists(db, albumId, track.item);
    db.albums[albumId].tracks[trackId] = track;
    updateAlbumSize(db, albumId);
  } else {
    // Add as standalone track
    db.tracks[trackId] = track;
  }

  saveAudioDownloadsDatabase(db);
}

/**
 * Add a downloaded album to the database
 */
export function addDownloadedAlbum(
  album: DownloadedAlbum,
  artistId?: string,
): void {
  const db = getAudioDownloadsDatabase();
  const albumId = album.albumInfo.Id;

  if (!albumId) return;

  if (artistId) {
    ensureArtistExists(db, artistId, album.albumInfo);
    db.artists[artistId].albums[albumId] = album;
    updateArtistSize(db, artistId);
  } else {
    db.albums[albumId] = album;
  }

  saveAudioDownloadsDatabase(db);
}

/**
 * Add a downloaded artist to the database
 */
export function addDownloadedArtist(artist: DownloadedArtist): void {
  const db = getAudioDownloadsDatabase();
  const artistId = artist.artistInfo.Id;

  if (!artistId) return;

  db.artists[artistId] = artist;
  saveAudioDownloadsDatabase(db);
}

/**
 * Remove a downloaded track from the database
 */
export function removeDownloadedTrack(
  trackId: string,
): DownloadedAudioItem | undefined {
  const db = getAudioDownloadsDatabase();
  let removed: DownloadedAudioItem | undefined;

  // Check standalone tracks
  if (db.tracks[trackId]) {
    removed = db.tracks[trackId];
    delete db.tracks[trackId];
    saveAudioDownloadsDatabase(db);
    return removed;
  }

  // Check albums
  for (const albumId in db.albums) {
    const album = db.albums[albumId];
    if (album.tracks[trackId]) {
      removed = album.tracks[trackId];
      delete album.tracks[trackId];
      updateAlbumSize(db, albumId);

      // Remove empty album
      if (Object.keys(album.tracks).length === 0) {
        delete db.albums[albumId];
      }

      saveAudioDownloadsDatabase(db);
      return removed;
    }
  }

  // Check artists
  for (const artistId in db.artists) {
    const artist = db.artists[artistId];
    for (const albumId in artist.albums) {
      const album = artist.albums[albumId];
      if (album.tracks[trackId]) {
        removed = album.tracks[trackId];
        delete album.tracks[trackId];

        // Remove empty album
        if (Object.keys(album.tracks).length === 0) {
          delete artist.albums[albumId];
        }

        // Remove empty artist
        if (Object.keys(artist.albums).length === 0) {
          delete db.artists[artistId];
        } else {
          updateArtistSize(db, artistId);
        }

        saveAudioDownloadsDatabase(db);
        return removed;
      }
    }
  }

  return undefined;
}

/**
 * Remove a downloaded album and all its tracks
 */
export function removeDownloadedAlbum(
  albumId: string,
): DownloadedAlbum | undefined {
  const db = getAudioDownloadsDatabase();
  let removed: DownloadedAlbum | undefined;

  // Check standalone albums
  if (db.albums[albumId]) {
    removed = db.albums[albumId];
    delete db.albums[albumId];
    saveAudioDownloadsDatabase(db);
    return removed;
  }

  // Check artists
  for (const artistId in db.artists) {
    const artist = db.artists[artistId];
    if (artist.albums[albumId]) {
      removed = artist.albums[albumId];
      delete artist.albums[albumId];

      // Remove empty artist
      if (Object.keys(artist.albums).length === 0) {
        delete db.artists[artistId];
      } else {
        updateArtistSize(db, artistId);
      }

      saveAudioDownloadsDatabase(db);
      return removed;
    }
  }

  return undefined;
}

/**
 * Remove a downloaded artist and all their albums/tracks
 */
export function removeDownloadedArtist(
  artistId: string,
): DownloadedArtist | undefined {
  const db = getAudioDownloadsDatabase();

  if (db.artists[artistId]) {
    const removed = db.artists[artistId];
    delete db.artists[artistId];
    saveAudioDownloadsDatabase(db);
    return removed;
  }

  return undefined;
}

/**
 * Update a downloaded track's metadata
 */
export function updateDownloadedTrack(
  trackId: string,
  updates: Partial<DownloadedAudioItem>,
): void {
  const db = getAudioDownloadsDatabase();

  // Check standalone tracks
  if (db.tracks[trackId]) {
    db.tracks[trackId] = { ...db.tracks[trackId], ...updates };
    saveAudioDownloadsDatabase(db);
    return;
  }

  // Check albums
  for (const album of Object.values(db.albums)) {
    if (album.tracks[trackId]) {
      album.tracks[trackId] = { ...album.tracks[trackId], ...updates };
      saveAudioDownloadsDatabase(db);
      return;
    }
  }

  // Check artists
  for (const artist of Object.values(db.artists)) {
    for (const album of Object.values(artist.albums)) {
      if (album.tracks[trackId]) {
        album.tracks[trackId] = { ...album.tracks[trackId], ...updates };
        saveAudioDownloadsDatabase(db);
        return;
      }
    }
  }
}

/**
 * Clear all downloaded audio items
 */
export function clearAllAudioDownloads(): void {
  saveAudioDownloadsDatabase({ albums: {}, artists: {}, tracks: {} });
}

/**
 * Calculate total size of all audio downloads in bytes
 */
export function getTotalAudioDownloadSize(): number {
  const items = getAllDownloadedAudioItems();
  return items.reduce((total, item) => total + (item.audioFileSize || 0), 0);
}

/**
 * Get downloads by cache type
 */
export function getDownloadsByCacheType(
  cacheType: "permanent" | "temporary" | "favorite",
): DownloadedAudioItem[] {
  return getAllDownloadedAudioItems().filter(
    (item) => item.cacheType === cacheType,
  );
}

// Helper functions

function ensureArtistExists(
  db: AudioDownloadsDatabase,
  artistId: string,
  itemWithArtistInfo: BaseItemDto,
): void {
  if (!db.artists[artistId]) {
    const artistInfo: Partial<BaseItemDto> = {
      Id: artistId,
      Name:
        itemWithArtistInfo.AlbumArtist ||
        itemWithArtistInfo.Artists?.[0] ||
        "Unknown Artist",
      Type: "MusicArtist",
    };
    db.artists[artistId] = {
      artistInfo: artistInfo as BaseItemDto,
      albums: {},
      totalSize: 0,
      downloadedAt: new Date().toISOString(),
    };
  }
}

function ensureAlbumExists(
  db: AudioDownloadsDatabase,
  albumId: string,
  itemWithAlbumInfo: BaseItemDto,
): void {
  if (!db.albums[albumId]) {
    const albumInfo: Partial<BaseItemDto> = {
      Id: albumId,
      Name: itemWithAlbumInfo.Album || "Unknown Album",
      Type: "MusicAlbum",
      AlbumArtist: itemWithAlbumInfo.AlbumArtist,
      Artists: itemWithAlbumInfo.Artists,
      ArtistItems: itemWithAlbumInfo.ArtistItems,
      AlbumId: itemWithAlbumInfo.AlbumId,
      AlbumPrimaryImageTag: itemWithAlbumInfo.AlbumPrimaryImageTag,
    };
    db.albums[albumId] = {
      albumInfo: albumInfo as BaseItemDto,
      tracks: {},
      totalSize: 0,
      downloadedAt: new Date().toISOString(),
    };
  }
}

function ensureAlbumExistsInArtist(
  db: AudioDownloadsDatabase,
  artistId: string,
  albumId: string,
  itemWithAlbumInfo: BaseItemDto,
): void {
  if (!db.artists[artistId].albums[albumId]) {
    const albumInfo: Partial<BaseItemDto> = {
      Id: albumId,
      Name: itemWithAlbumInfo.Album || "Unknown Album",
      Type: "MusicAlbum",
      AlbumArtist: itemWithAlbumInfo.AlbumArtist,
      Artists: itemWithAlbumInfo.Artists,
      ArtistItems: itemWithAlbumInfo.ArtistItems,
      AlbumId: itemWithAlbumInfo.AlbumId,
      AlbumPrimaryImageTag: itemWithAlbumInfo.AlbumPrimaryImageTag,
    };
    db.artists[artistId].albums[albumId] = {
      albumInfo: albumInfo as BaseItemDto,
      tracks: {},
      totalSize: 0,
      downloadedAt: new Date().toISOString(),
    };
  }
}

function updateAlbumSize(db: AudioDownloadsDatabase, albumId: string): void {
  const album = db.albums[albumId];
  if (album) {
    album.totalSize = Object.values(album.tracks).reduce(
      (total, track) => total + (track.audioFileSize || 0),
      0,
    );
  }
}

function updateArtistSize(db: AudioDownloadsDatabase, artistId: string): void {
  const artist = db.artists[artistId];
  if (artist) {
    artist.totalSize = Object.values(artist.albums).reduce(
      (total, album) =>
        total +
        Object.values(album.tracks).reduce(
          (albumTotal, track) => albumTotal + (track.audioFileSize || 0),
          0,
        ),
      0,
    );
  }
}

// Play statistics functions

/**
 * Get play statistics from storage
 */
export function getPlayStats(): Record<string, TrackPlayStats> {
  const file = storage.getString(AUDIO_PLAY_STATS_KEY);
  if (file) {
    return JSON.parse(file) as Record<string, TrackPlayStats>;
  }
  return {};
}

/**
 * Save play statistics to storage
 */
export function savePlayStats(stats: Record<string, TrackPlayStats>): void {
  storage.set(AUDIO_PLAY_STATS_KEY, JSON.stringify(stats));
}

/**
 * Increment play count for a track
 */
export function incrementPlayCount(itemId: string): TrackPlayStats {
  const stats = getPlayStats();

  if (!stats[itemId]) {
    stats[itemId] = {
      itemId,
      playCount: 0,
      lastPlayedDate: new Date().toISOString(),
      autoFavorited: false,
      totalListenTime: 0,
    };
  }

  stats[itemId].playCount += 1;
  stats[itemId].lastPlayedDate = new Date().toISOString();

  savePlayStats(stats);
  return stats[itemId];
}

/**
 * Add listen time for a track
 */
export function addListenTime(itemId: string, seconds: number): void {
  const stats = getPlayStats();

  if (!stats[itemId]) {
    stats[itemId] = {
      itemId,
      playCount: 0,
      lastPlayedDate: new Date().toISOString(),
      autoFavorited: false,
      totalListenTime: 0,
    };
  }

  stats[itemId].totalListenTime += seconds;
  savePlayStats(stats);
}

/**
 * Mark a track as auto-favorited
 */
export function markAsAutoFavorited(itemId: string): void {
  const stats = getPlayStats();

  if (stats[itemId]) {
    stats[itemId].autoFavorited = true;
    savePlayStats(stats);
  }
}

/**
 * Get play count for a track
 */
export function getPlayCount(itemId: string): number {
  const stats = getPlayStats();
  return stats[itemId]?.playCount || 0;
}

/**
 * Check if a track was auto-favorited
 */
export function wasAutoFavorited(itemId: string): boolean {
  const stats = getPlayStats();
  return stats[itemId]?.autoFavorited || false;
}

/**
 * Get the last played date for a track
 */
export function getLastPlayedDate(itemId: string): Date | null {
  const stats = getPlayStats();
  const lastPlayed = stats[itemId]?.lastPlayedDate;
  return lastPlayed ? new Date(lastPlayed) : null;
}

/**
 * Get all temporary cached tracks sorted by last played date (oldest first)
 */
export function getTemporaryCacheByLastPlayed(): Array<{
  item: DownloadedAudioItem;
  lastPlayedDate: Date;
}> {
  const items = getDownloadsByCacheType("temporary");
  const stats = getPlayStats();

  return items
    .map((item) => {
      const itemId = item.item.Id;
      const lastPlayedStr = itemId ? stats[itemId]?.lastPlayedDate : null;
      // Use download time as fallback if never played
      const lastPlayedDate = lastPlayedStr
        ? new Date(lastPlayedStr)
        : new Date(0); // Very old date if never played
      return { item, lastPlayedDate };
    })
    .sort((a, b) => a.lastPlayedDate.getTime() - b.lastPlayedDate.getTime());
}

/**
 * Remove tracks from temporary cache that haven't been played in X days
 * Returns the IDs of removed tracks
 */
export function cleanupOldTemporaryCache(maxAgeDays: number): string[] {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);

  const sortedCache = getTemporaryCacheByLastPlayed();
  const removedIds: string[] = [];

  for (const { item, lastPlayedDate } of sortedCache) {
    if (lastPlayedDate < cutoffDate && item.item.Id) {
      removeDownloadedTrack(item.item.Id);
      removedIds.push(item.item.Id);
    }
  }

  return removedIds;
}

/**
 * Get total size of temporary cache in bytes
 */
export function getTemporaryCacheSize(): number {
  const items = getDownloadsByCacheType("temporary");
  return items.reduce((total, item) => total + (item.audioFileSize || 0), 0);
}

/**
 * Evict oldest tracks from temporary cache until under the size limit
 * Returns the IDs of removed tracks
 */
export function evictOldestFromTemporaryCache(maxSizeBytes: number): string[] {
  const removedIds: string[] = [];
  let currentSize = getTemporaryCacheSize();

  if (currentSize <= maxSizeBytes) {
    return removedIds;
  }

  const sortedCache = getTemporaryCacheByLastPlayed();

  for (const { item } of sortedCache) {
    if (currentSize <= maxSizeBytes) {
      break;
    }

    const itemId = item.item.Id;
    if (itemId) {
      const itemSize = item.audioFileSize || 0;
      removeDownloadedTrack(itemId);
      removedIds.push(itemId);
      currentSize -= itemSize;
    }
  }

  return removedIds;
}

/**
 * Perform cache maintenance: remove old tracks and enforce size limits
 * Returns the IDs of all removed tracks
 */
export function performCacheMaintenance(
  maxAgeDays: number,
  maxSizeBytes: number,
): string[] {
  // First, remove tracks that are too old
  const removedByAge = cleanupOldTemporaryCache(maxAgeDays);

  // Then, evict by size if still over limit
  const removedBySize = evictOldestFromTemporaryCache(maxSizeBytes);

  return [...removedByAge, ...removedBySize];
}

// Domain model conversion functions

import { toAlbum, toArtist, toSong } from "@/models/music/adapters";
import type { Album, Artist, Song } from "@/models/music/types";
import { CacheType } from "@/models/music/types";

/**
 * Get all downloaded songs as domain models
 * Converts downloaded audio items to Song domain models with Offline source
 */
export function getDownloadedSongsAsDomainModels(): Song[] {
  const items = getAllDownloadedAudioItems();
  const stats = getPlayStats();

  return items.map((item) => {
    const itemId = item.item.Id!;
    const playCount = stats[itemId]?.playCount || item.playCount || 0;
    const lastPlayedStr = stats[itemId]?.lastPlayedDate || item.lastPlayedDate;

    return toSong(item.item, {
      filePath: item.audioFilePath,
      fileSize: item.audioFileSize,
      cacheType: item.cacheType as CacheType,
      downloadedAt: new Date(), // Use current time as fallback
      playCount,
      lastPlayedAt: lastPlayedStr ? new Date(lastPlayedStr) : undefined,
    });
  });
}

/**
 * Get all downloaded albums as domain models
 * Processes both standalone albums and albums within artists
 */
export function getDownloadedAlbumsAsDomainModels(): Album[] {
  const db = getAudioDownloadsDatabase();
  const albums: Album[] = [];
  const seenAlbumIds = new Set<string>();

  // Process standalone albums
  for (const album of Object.values(db.albums)) {
    const albumId = album.albumInfo.Id!;
    if (!seenAlbumIds.has(albumId)) {
      albums.push(
        toAlbum(album.albumInfo, {
          totalSize: album.totalSize,
          downloadedAt: new Date(album.downloadedAt),
          downloadedTrackCount: Object.keys(album.tracks).length,
          totalTrackCount: Object.keys(album.tracks).length,
        }),
      );
      seenAlbumIds.add(albumId);
    }
  }

  // Process artist albums
  for (const artist of Object.values(db.artists)) {
    for (const album of Object.values(artist.albums)) {
      const albumId = album.albumInfo.Id!;
      if (!seenAlbumIds.has(albumId)) {
        albums.push(
          toAlbum(album.albumInfo, {
            totalSize: album.totalSize,
            downloadedAt: new Date(album.downloadedAt),
            downloadedTrackCount: Object.keys(album.tracks).length,
            totalTrackCount: Object.keys(album.tracks).length,
          }),
        );
        seenAlbumIds.add(albumId);
      }
    }
  }

  return albums;
}

/**
 * Get all downloaded artists as domain models
 * Includes artists from db.artists AND inferred from standalone albums
 */
export function getDownloadedArtistsAsDomainModels(): Artist[] {
  const db = getAudioDownloadsDatabase();
  const seenArtistIds = new Set<string>();
  const artists: Artist[] = [];

  // First, get artists from the explicit artists structure
  for (const artist of Object.values(db.artists)) {
    const artistId = artist.artistInfo.Id;
    if (artistId && !seenArtistIds.has(artistId)) {
      artists.push(
        toArtist(artist.artistInfo, {
          totalSize: artist.totalSize,
          downloadedAt: new Date(artist.downloadedAt),
          downloadedAlbumCount: Object.keys(artist.albums).length,
          totalAlbumCount: Object.keys(artist.albums).length,
        }),
      );
      seenArtistIds.add(artistId);
    }
  }

  // Then, infer artists from standalone albums (not nested under artists)
  for (const album of Object.values(db.albums)) {
    const artistId = album.albumInfo.ArtistItems?.[0]?.Id;
    const artistName =
      album.albumInfo.AlbumArtist || album.albumInfo.Artists?.[0];

    if (artistId && !seenArtistIds.has(artistId) && artistName) {
      // Create a virtual artist from the album's artist info
      const virtualArtistInfo = {
        Id: artistId,
        Name: artistName,
        Type: "MusicArtist" as const,
      };

      artists.push(
        toArtist(virtualArtistInfo, {
          totalSize: album.totalSize,
          downloadedAt: new Date(album.downloadedAt),
          downloadedAlbumCount: 1,
          totalAlbumCount: 1,
        }),
      );
      seenArtistIds.add(artistId);
    }
  }

  return artists;
}

// Helper functions for download status checks

/**
 * Check if an album has any downloaded tracks
 */
export function isAlbumDownloaded(albumId: string): boolean {
  if (!albumId) return false;
  const album = getDownloadedAlbumById(albumId);
  return album !== undefined && Object.keys(album.tracks).length > 0;
}

/**
 * Check if an artist has any downloaded tracks (by artist ID)
 */
export function isArtistDownloaded(artistId: string): boolean {
  if (!artistId) return false;
  const artist = getDownloadedArtistById(artistId);
  return artist !== undefined && Object.keys(artist.albums).length > 0;
}

/**
 * Get all track IDs for an album (for deletion)
 */
export function getAlbumTrackIds(albumId: string): string[] {
  if (!albumId) return [];

  const album = getDownloadedAlbumById(albumId);
  if (!album) return [];

  return Object.keys(album.tracks);
}

/**
 * Remove audio download entries that have empty or invalid file paths.
 * This cleans up corrupted data from interrupted downloads or deleted files.
 * Returns the number of entries removed.
 */
export function cleanupInvalidAudioEntries(): number {
  const db = getAudioDownloadsDatabase();
  let removedCount = 0;

  // Clean up standalone tracks with empty paths
  for (const trackId of Object.keys(db.tracks)) {
    if (!db.tracks[trackId].audioFilePath) {
      console.log(
        `[AudioDB Cleanup] Removing invalid track: ${db.tracks[trackId].item.Name}`,
      );
      delete db.tracks[trackId];
      removedCount++;
    }
  }

  // Clean up album tracks with empty paths
  for (const albumId of Object.keys(db.albums)) {
    const album = db.albums[albumId];
    for (const trackId of Object.keys(album.tracks)) {
      if (!album.tracks[trackId].audioFilePath) {
        console.log(
          `[AudioDB Cleanup] Removing invalid album track: ${album.tracks[trackId].item.Name}`,
        );
        delete album.tracks[trackId];
        removedCount++;
      }
    }

    // Remove empty albums
    if (Object.keys(album.tracks).length === 0) {
      console.log(
        `[AudioDB Cleanup] Removing empty album: ${album.albumInfo.Name}`,
      );
      delete db.albums[albumId];
    } else {
      updateAlbumSize(db, albumId);
    }
  }

  // Clean up artist album tracks with empty paths
  for (const artistId of Object.keys(db.artists)) {
    const artist = db.artists[artistId];
    for (const albumId of Object.keys(artist.albums)) {
      const album = artist.albums[albumId];
      for (const trackId of Object.keys(album.tracks)) {
        if (!album.tracks[trackId].audioFilePath) {
          console.log(
            `[AudioDB Cleanup] Removing invalid artist album track: ${album.tracks[trackId].item.Name}`,
          );
          delete album.tracks[trackId];
          removedCount++;
        }
      }

      // Remove empty albums
      if (Object.keys(album.tracks).length === 0) {
        console.log(
          `[AudioDB Cleanup] Removing empty artist album: ${album.albumInfo.Name}`,
        );
        delete artist.albums[albumId];
      }
    }

    // Remove empty artists
    if (Object.keys(artist.albums).length === 0) {
      console.log(
        `[AudioDB Cleanup] Removing empty artist: ${artist.artistInfo.Name}`,
      );
      delete db.artists[artistId];
    } else {
      updateArtistSize(db, artistId);
    }
  }

  if (removedCount > 0) {
    saveAudioDownloadsDatabase(db);
    console.log(
      `[AudioDB Cleanup] Removed ${removedCount} invalid entries from audio database`,
    );
  }

  return removedCount;
}
