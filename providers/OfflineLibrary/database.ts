import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { getAudioDownloadsDatabase } from "@/providers/AudioPlayer/database";
import {
  getAllDownloadedItems,
  getDownloadsDatabase,
} from "@/providers/Downloads/database";
import type { LibraryFilters, LibraryQueryResult } from "./types";

/**
 * Get all downloaded items from both video and audio databases
 */
export function getAllOfflineItems(): BaseItemDto[] {
  const videoItems = getAllDownloadedItems().map((d) => d.item);
  const audioDb = getAudioDownloadsDatabase();
  const audioItems: BaseItemDto[] = [];

  // Get standalone tracks
  for (const track of Object.values(audioDb.tracks || {})) {
    audioItems.push(track.item);
  }

  // Get album tracks
  for (const album of Object.values(audioDb.albums || {})) {
    // Add album itself
    if (album.albumInfo) {
      audioItems.push(album.albumInfo);
    }
    // Add tracks from album
    for (const track of Object.values(album.tracks || {})) {
      audioItems.push(track.item);
    }
  }

  // Get artist albums and tracks
  for (const artist of Object.values(audioDb.artists || {})) {
    // Add artist itself
    if (artist.artistInfo) {
      audioItems.push(artist.artistInfo);
    }
    // Add albums and tracks
    for (const album of Object.values(artist.albums || {})) {
      if (album.albumInfo) {
        audioItems.push(album.albumInfo);
      }
      for (const track of Object.values(album.tracks || {})) {
        audioItems.push(track.item);
      }
    }
  }

  return [...videoItems, ...audioItems];
}

/**
 * Query offline library with filters and pagination
 */
export function queryOfflineLibrary(
  filters?: LibraryFilters,
): LibraryQueryResult {
  let items = getAllOfflineItems();

  // Filter by type
  if (filters?.type) {
    items = items.filter((item) => item.Type === filters.type);
  }

  // Filter by search term
  if (filters?.searchTerm) {
    const search = filters.searchTerm.toLowerCase();
    items = items.filter(
      (item) =>
        item.Name?.toLowerCase().includes(search) ||
        item.Album?.toLowerCase().includes(search) ||
        item.Artists?.some((artist) => artist.toLowerCase().includes(search)),
    );
  }

  // Sort
  if (filters?.sortBy) {
    items.sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (filters.sortBy) {
        case "Name":
          aValue = a.Name || "";
          bValue = b.Name || "";
          break;
        case "DateCreated":
          aValue = a.DateCreated ? new Date(a.DateCreated).getTime() : 0;
          bValue = b.DateCreated ? new Date(b.DateCreated).getTime() : 0;
          break;
        case "PremiereDate":
          aValue = a.PremiereDate ? new Date(a.PremiereDate).getTime() : 0;
          bValue = b.PremiereDate ? new Date(b.PremiereDate).getTime() : 0;
          break;
        default:
          aValue = a.Name || "";
          bValue = b.Name || "";
      }

      if (filters.sortOrder === "Descending") {
        return bValue > aValue ? 1 : -1;
      }
      return aValue > bValue ? 1 : -1;
    });
  }

  const totalCount = items.length;
  const startIndex = filters?.startIndex || 0;
  const limit = filters?.limit;

  // Apply pagination
  if (limit !== undefined) {
    items = items.slice(startIndex, startIndex + limit);
  } else if (startIndex > 0) {
    items = items.slice(startIndex);
  }

  return {
    items,
    totalCount,
    startIndex,
  };
}

/**
 * Get a downloaded item by ID
 */
export function getOfflineItemById(itemId: string): BaseItemDto | null {
  const allItems = getAllOfflineItems();
  return allItems.find((item) => item.Id === itemId) || null;
}

/**
 * Check if an item is available offline
 */
export function isItemAvailableOffline(itemId: string): boolean {
  return getOfflineItemById(itemId) !== null;
}

/**
 * Get offline artists
 */
export function getOfflineArtists(): BaseItemDto[] {
  const audioDb = getAudioDownloadsDatabase();
  const artists: BaseItemDto[] = [];

  for (const artist of Object.values(audioDb.artists || {})) {
    if (artist.artistInfo) {
      artists.push(artist.artistInfo);
    }
  }

  return artists;
}

/**
 * Get offline albums (both standalone and from artists)
 */
export function getOfflineAlbums(): BaseItemDto[] {
  const audioDb = getAudioDownloadsDatabase();
  const albums: BaseItemDto[] = [];

  // Standalone albums
  for (const album of Object.values(audioDb.albums || {})) {
    if (album.albumInfo) {
      albums.push(album.albumInfo);
    }
  }

  // Albums from artists
  for (const artist of Object.values(audioDb.artists || {})) {
    for (const album of Object.values(artist.albums || {})) {
      if (album.albumInfo) {
        // Check if not already added (from standalone albums)
        if (!albums.some((a) => a.Id === album.albumInfo.Id)) {
          albums.push(album.albumInfo);
        }
      }
    }
  }

  return albums;
}

/**
 * Get offline movies
 */
export function getOfflineMovies(): BaseItemDto[] {
  const db = getDownloadsDatabase();
  return Object.values(db.movies).map((d) => d.item);
}

/**
 * Get offline series (shows)
 */
export function getOfflineSeries(): BaseItemDto[] {
  const db = getDownloadsDatabase();
  return Object.values(db.series).map((s) => s.seriesInfo);
}

/**
 * Get available offline library views based on downloaded content
 * Returns virtual library views for content types that have downloads
 */
export function getOfflineLibraryViews(): BaseItemDto[] {
  const views: BaseItemDto[] = [];

  // Check for music content
  const audioDb = getAudioDownloadsDatabase();

  // Count albums including those nested under artists
  const standaloneAlbumCount = Object.keys(audioDb.albums || {}).length;
  let artistAlbumCount = 0;
  let artistTrackCount = 0;
  for (const artist of Object.values(audioDb.artists || {})) {
    artistAlbumCount += Object.keys(artist.albums || {}).length;
    for (const album of Object.values(artist.albums || {})) {
      artistTrackCount += Object.keys(album.tracks || {}).length;
    }
  }
  const totalAlbumCount = standaloneAlbumCount + artistAlbumCount;
  const totalTrackCount =
    Object.keys(audioDb.tracks || {}).length + artistTrackCount;

  const hasMusic =
    Object.keys(audioDb.artists || {}).length > 0 ||
    totalAlbumCount > 0 ||
    totalTrackCount > 0;

  console.log(
    `[OfflineLibrary] Music check - artists: ${Object.keys(audioDb.artists || {}).length}, albums: ${totalAlbumCount} (standalone: ${standaloneAlbumCount}, under artists: ${artistAlbumCount}), tracks: ${totalTrackCount}`,
  );

  if (hasMusic) {
    views.push({
      Id: "offline-music",
      Name: "Music (Offline)",
      CollectionType: "music",
      Type: "CollectionFolder",
    } as BaseItemDto);
  }

  // Check for movies
  const db = getDownloadsDatabase();
  if (Object.keys(db.movies).length > 0) {
    views.push({
      Id: "offline-movies",
      Name: "Movies (Offline)",
      CollectionType: "movies",
      Type: "CollectionFolder",
    } as BaseItemDto);
  }

  // Check for TV shows
  if (Object.keys(db.series).length > 0) {
    views.push({
      Id: "offline-tvshows",
      Name: "TV Shows (Offline)",
      CollectionType: "tvshows",
      Type: "CollectionFolder",
    } as BaseItemDto);
  }

  return views;
}

// Domain model conversion functions

import type { Album, Artist, Song } from "@/models/music/types";
import {
  getDownloadedAlbumsAsDomainModels,
  getDownloadedArtistsAsDomainModels,
  getDownloadedSongsAsDomainModels,
} from "@/providers/AudioPlayer/database";

/**
 * Get offline artists as domain models
 */
export function getOfflineArtistsAsDomainModels(): Artist[] {
  return getDownloadedArtistsAsDomainModels();
}

/**
 * Get offline albums as domain models
 */
export function getOfflineAlbumsAsDomainModels(): Album[] {
  return getDownloadedAlbumsAsDomainModels();
}

/**
 * Get offline songs as domain models
 */
export function getOfflineSongsAsDomainModels(): Song[] {
  return getDownloadedSongsAsDomainModels();
}
