import { toAlbum, toArtist, toSong } from "@/models/music/adapters";
import type { Album, Artist, Playlist, Song } from "@/models/music/types";
import {
  getDownloadedAlbumById,
  getDownloadedArtistById,
  getDownloadedAudioById,
} from "@/providers/AudioPlayer/database";
import {
  getOfflineAlbumsAsDomainModels,
  getOfflineArtistsAsDomainModels,
  getOfflineItemById,
  getOfflineSongsAsDomainModels,
} from "@/providers/OfflineLibrary/database";
import { updateLocalUserData } from "@/providers/OfflineLibrary/localUserData";
import { addMutation } from "@/providers/OfflineLibrary/mutationQueue";
import type { MusicLibraryApi } from "../interfaces/MusicLibraryApi";
import type {
  AlbumFilters,
  ArtistFilters,
  PaginatedResult,
  PlaybackProgress,
  PlaylistFilters,
  SongFilters,
} from "../interfaces/types";

/**
 * Offline music API implementation
 * Returns only downloaded content from local database
 */
export class OfflineMusicApi implements MusicLibraryApi {
  // ========== Collection Queries ==========

  async getArtists(filters?: ArtistFilters): Promise<PaginatedResult<Artist>> {
    // Get all offline artists as domain models (already converted)
    let artists = getOfflineArtistsAsDomainModels();

    // Apply filters
    if (filters?.searchTerm) {
      const search = filters.searchTerm.toLowerCase();
      artists = artists.filter((artist) =>
        artist.name.toLowerCase().includes(search),
      );
    }

    // Sort
    if (filters?.sortBy) {
      artists.sort((a, b) => {
        const aValue = a.name;
        const bValue = b.name;
        if (filters.sortOrder === "Descending") {
          return bValue > aValue ? 1 : -1;
        }
        return aValue > bValue ? 1 : -1;
      });
    }

    const totalCount = artists.length;
    const startIndex = filters?.startIndex || 0;
    const limit = filters?.limit;

    // Pagination
    if (limit !== undefined) {
      artists = artists.slice(startIndex, startIndex + limit);
    } else if (startIndex > 0) {
      artists = artists.slice(startIndex);
    }

    return {
      items: artists,
      totalCount,
      startIndex,
    };
  }

  async getAlbums(filters?: AlbumFilters): Promise<PaginatedResult<Album>> {
    // Get all offline albums as domain models
    let albums = getOfflineAlbumsAsDomainModels();

    // Apply filters
    if (filters?.artistId) {
      albums = albums.filter((album) => album.artistId === filters.artistId);
    }

    if (filters?.searchTerm) {
      const search = filters.searchTerm.toLowerCase();
      albums = albums.filter(
        (album) =>
          album.name.toLowerCase().includes(search) ||
          album.artistName?.toLowerCase().includes(search),
      );
    }

    // Sort
    if (filters?.sortBy) {
      albums.sort((a, b) => {
        const aValue = a.name;
        const bValue = b.name;
        if (filters.sortOrder === "Descending") {
          return bValue > aValue ? 1 : -1;
        }
        return aValue > bValue ? 1 : -1;
      });
    }

    const totalCount = albums.length;
    const startIndex = filters?.startIndex || 0;
    const limit = filters?.limit;

    // Pagination
    if (limit !== undefined) {
      albums = albums.slice(startIndex, startIndex + limit);
    } else if (startIndex > 0) {
      albums = albums.slice(startIndex);
    }

    return {
      items: albums,
      totalCount,
      startIndex,
    };
  }

  async getSongs(filters?: SongFilters): Promise<PaginatedResult<Song>> {
    // Get all offline songs as domain models
    let songs = getOfflineSongsAsDomainModels();

    // Apply filters
    if (filters?.artistId) {
      songs = songs.filter((song) => song.artistId === filters.artistId);
    }

    if (filters?.albumId) {
      songs = songs.filter((song) => song.albumId === filters.albumId);
    }

    if (filters?.searchTerm) {
      const search = filters.searchTerm.toLowerCase();
      songs = songs.filter(
        (song) =>
          song.title.toLowerCase().includes(search) ||
          song.artistName?.toLowerCase().includes(search) ||
          song.albumName?.toLowerCase().includes(search),
      );
    }

    // Sort by track number if part of an album
    if (filters?.albumId) {
      songs.sort((a, b) => {
        const aTrack = a.trackNumber || 0;
        const bTrack = b.trackNumber || 0;
        return aTrack - bTrack;
      });
    } else if (filters?.sortBy) {
      // Custom sort
      songs.sort((a, b) => {
        const aValue = a.title;
        const bValue = b.title;
        if (filters.sortOrder === "Descending") {
          return bValue > aValue ? 1 : -1;
        }
        return aValue > bValue ? 1 : -1;
      });
    }

    const totalCount = songs.length;
    const startIndex = filters?.startIndex || 0;
    const limit = filters?.limit;

    // Pagination
    if (limit !== undefined) {
      songs = songs.slice(startIndex, startIndex + limit);
    } else if (startIndex > 0) {
      songs = songs.slice(startIndex);
    }

    return {
      items: songs,
      totalCount,
      startIndex,
    };
  }

  async getPlaylists(
    _filters?: PlaylistFilters,
  ): Promise<PaginatedResult<Playlist>> {
    // Playlists not currently supported offline
    return {
      items: [],
      totalCount: 0,
      startIndex: 0,
    };
  }

  // ========== Single Item Queries ==========

  async getItem(id: string): Promise<Album | Artist | Song | Playlist | null> {
    const item = getOfflineItemById(id);
    if (!item) return null;

    if (item.Type === "MusicAlbum") {
      return this.getAlbum(id);
    } else if (item.Type === "MusicArtist") {
      return this.getArtist(id);
    } else if (item.Type === "Audio") {
      return this.getSong(id);
    }

    return null;
  }

  async getItems(ids: string[]): Promise<(Album | Artist | Song | Playlist)[]> {
    const results: (Album | Artist | Song | Playlist)[] = [];

    for (const id of ids) {
      const item = await this.getItem(id);
      if (item) {
        results.push(item);
      }
    }

    return results;
  }

  async getArtist(id: string): Promise<Artist | null> {
    const item = getOfflineItemById(id);
    if (!item || item.Type !== "MusicArtist") return null;

    const downloadInfo = getDownloadedArtistById(id);
    return toArtist(item, downloadInfo);
  }

  async getAlbum(id: string): Promise<Album | null> {
    const item = getOfflineItemById(id);
    if (!item || item.Type !== "MusicAlbum") return null;

    const downloadInfo = getDownloadedAlbumById(id);
    return toAlbum(item, downloadInfo);
  }

  async getSong(id: string): Promise<Song | null> {
    const item = getOfflineItemById(id);
    if (!item || item.Type !== "Audio") return null;

    const downloadInfo = getDownloadedAudioById(id);
    return toSong(item, downloadInfo);
  }

  async getPlaylist(_id: string): Promise<Playlist | null> {
    // Playlists not currently supported offline
    return null;
  }

  // ========== Relationship Queries ==========

  async getArtistAlbums(
    artistId: string,
    filters?: AlbumFilters,
  ): Promise<Album[]> {
    const result = await this.getAlbums({
      ...filters,
      artistId,
    });
    return result.items;
  }

  async getAlbumSongs(albumId: string): Promise<Song[]> {
    const result = await this.getSongs({ albumId });
    return result.items;
  }

  async getPlaylistSongs(_playlistId: string): Promise<Song[]> {
    return [];
  }

  // ========== User Data Mutations ==========
  // These update local data and queue for sync when online

  async markFavorite(itemId: string): Promise<void> {
    updateLocalUserData(itemId, { IsFavorite: true });
    addMutation("FAVORITE", itemId, {});
  }

  async unmarkFavorite(itemId: string): Promise<void> {
    updateLocalUserData(itemId, { IsFavorite: false });
    addMutation("UNFAVORITE", itemId, {});
  }

  async markPlayed(itemId: string, datePlayed?: Date): Promise<void> {
    updateLocalUserData(itemId, {
      Played: true,
      LastPlayedDate: datePlayed?.toISOString() || new Date().toISOString(),
    });
    addMutation("MARK_PLAYED", itemId, {
      datePlayed: datePlayed?.toISOString(),
    });
  }

  async markUnplayed(itemId: string): Promise<void> {
    updateLocalUserData(itemId, { Played: false });
    addMutation("MARK_UNPLAYED", itemId, {});
  }

  async updatePlaybackProgress(
    itemId: string,
    progress: PlaybackProgress,
  ): Promise<void> {
    updateLocalUserData(itemId, {
      PlaybackPositionTicks: progress.positionTicks,
    });
    addMutation("PLAYBACK_PROGRESS", itemId, {
      positionTicks: progress.positionTicks,
      isPaused: progress.isPaused,
    });
  }
}
