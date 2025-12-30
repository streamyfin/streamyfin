import type { Api } from "@jellyfin/sdk";
import type { ItemSortBy } from "@jellyfin/sdk/lib/generated-client";
import {
  getArtistsApi,
  getItemsApi,
  getPlaystateApi,
  getUserLibraryApi,
} from "@jellyfin/sdk/lib/utils/api";
import { toAlbum, toArtist, toPlaylist, toSong } from "@/models/music/adapters";
import type { Album, Artist, Playlist, Song } from "@/models/music/types";
import {
  getDownloadedAlbumById,
  getDownloadedArtistById,
  getDownloadedAudioById,
} from "@/providers/AudioPlayer/database";
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
 * Online Jellyfin music API implementation
 * Automatically enriches results with download status (Approach A)
 */
export class JellyfinMusicApi implements MusicLibraryApi {
  constructor(
    private api: Api,
    private userId: string,
  ) {}

  // ========== Collection Queries ==========

  async getArtists(filters?: ArtistFilters): Promise<PaginatedResult<Artist>> {
    const response = await getArtistsApi(this.api).getArtists({
      userId: this.userId,
      parentId: filters?.libraryId,
      searchTerm: filters?.searchTerm,
      sortBy: (filters?.sortBy || ["SortName"]) as ItemSortBy[],
      sortOrder: filters?.sortOrder ? [filters.sortOrder] : ["Ascending"],
      startIndex: filters?.startIndex || 0,
      limit: filters?.limit, // undefined = fetch all items
      fields: ["Genres"],
    });

    const items = (response.data.Items || []).map((item) => {
      const downloadInfo = item.Id
        ? getDownloadedArtistById(item.Id)
        : undefined;
      return toArtist(item, downloadInfo, this.api);
    });

    return {
      items,
      totalCount: response.data.TotalRecordCount || 0,
      startIndex: filters?.startIndex || 0,
    };
  }

  async getAlbums(filters?: AlbumFilters): Promise<PaginatedResult<Album>> {
    const response = await getItemsApi(this.api).getItems({
      userId: this.userId,
      includeItemTypes: ["MusicAlbum"],
      parentId: filters?.libraryId,
      artistIds: filters?.artistId ? [filters.artistId] : undefined,
      searchTerm: filters?.searchTerm,
      sortBy: (filters?.sortBy || ["SortName"]) as ItemSortBy[],
      sortOrder: filters?.sortOrder ? [filters.sortOrder] : ["Ascending"],
      startIndex: filters?.startIndex || 0,
      limit: filters?.limit, // undefined = fetch all items
      recursive: true,
      fields: ["Genres"],
    });

    const items = (response.data.Items || []).map((item) => {
      const downloadInfo = item.Id
        ? getDownloadedAlbumById(item.Id)
        : undefined;
      return toAlbum(item, downloadInfo, this.api);
    });

    return {
      items,
      totalCount: response.data.TotalRecordCount || 0,
      startIndex: filters?.startIndex || 0,
    };
  }

  async getSongs(filters?: SongFilters): Promise<PaginatedResult<Song>> {
    const response = await getItemsApi(this.api).getItems({
      userId: this.userId,
      includeItemTypes: ["Audio"],
      parentId: filters?.libraryId,
      artistIds: filters?.artistId ? [filters.artistId] : undefined,
      albumIds: filters?.albumId ? [filters.albumId] : undefined,
      searchTerm: filters?.searchTerm,
      sortBy: (filters?.sortBy || ["SortName"]) as ItemSortBy[],
      sortOrder: filters?.sortOrder ? [filters.sortOrder] : ["Ascending"],
      startIndex: filters?.startIndex || 0,
      limit: filters?.limit || 50,
      recursive: true,
      fields: ["MediaSources"],
    });

    const items = (response.data.Items || []).map((item) => {
      const downloadInfo = item.Id
        ? getDownloadedAudioById(item.Id)
        : undefined;
      return toSong(item, downloadInfo, this.api, this.userId);
    });

    return {
      items,
      totalCount: response.data.TotalRecordCount || 0,
      startIndex: filters?.startIndex || 0,
    };
  }

  async getPlaylists(
    filters?: PlaylistFilters,
  ): Promise<PaginatedResult<Playlist>> {
    const response = await getItemsApi(this.api).getItems({
      userId: this.userId,
      includeItemTypes: ["Playlist"],
      parentId: filters?.libraryId,
      searchTerm: filters?.searchTerm,
      sortBy: (filters?.sortBy || ["SortName"]) as ItemSortBy[],
      sortOrder: filters?.sortOrder ? [filters.sortOrder] : ["Ascending"],
      startIndex: filters?.startIndex || 0,
      limit: filters?.limit || 50,
      recursive: true,
    });

    const items = (response.data.Items || []).map((item) => {
      // TODO: Add playlist download info when implemented
      return toPlaylist(item, undefined, this.api);
    });

    return {
      items,
      totalCount: response.data.TotalRecordCount || 0,
      startIndex: filters?.startIndex || 0,
    };
  }

  // ========== Single Item Queries ==========

  async getItem(id: string): Promise<Album | Artist | Song | Playlist | null> {
    return (
      (await this.getAlbum(id)) ||
      (await this.getArtist(id)) ||
      (await this.getSong(id)) ||
      (await this.getPlaylist(id))
    );
  }

  async getItems(ids: string[]): Promise<(Album | Artist | Song | Playlist)[]> {
    const response = await getItemsApi(this.api).getItems({
      ids,
      userId: this.userId,
    });

    return (response.data.Items || []).map((item) => {
      // Determine type and convert appropriately
      if (item.Type === "MusicAlbum") {
        const downloadInfo = item.Id
          ? getDownloadedAlbumById(item.Id)
          : undefined;
        return toAlbum(item, downloadInfo, this.api);
      } else if (item.Type === "MusicArtist") {
        const downloadInfo = item.Id
          ? getDownloadedArtistById(item.Id)
          : undefined;
        return toArtist(item, downloadInfo, this.api);
      } else if (item.Type === "Audio") {
        const downloadInfo = item.Id
          ? getDownloadedAudioById(item.Id)
          : undefined;
        return toSong(item, downloadInfo, this.api, this.userId);
      } else {
        return toPlaylist(item, undefined, this.api);
      }
    });
  }

  async getArtist(id: string): Promise<Artist | null> {
    const response = await getItemsApi(this.api).getItems({
      ids: [id],
      userId: this.userId,
      fields: ["Genres"],
    });

    const item = response.data.Items?.[0];
    if (!item) return null;

    const downloadInfo = getDownloadedArtistById(id);
    return toArtist(item, downloadInfo, this.api);
  }

  async getAlbum(id: string): Promise<Album | null> {
    const response = await getItemsApi(this.api).getItems({
      ids: [id],
      userId: this.userId,
      fields: ["Genres"],
    });

    const item = response.data.Items?.[0];
    if (!item) return null;

    const downloadInfo = getDownloadedAlbumById(id);
    return toAlbum(item, downloadInfo, this.api);
  }

  async getSong(id: string): Promise<Song | null> {
    const response = await getItemsApi(this.api).getItems({
      ids: [id],
      userId: this.userId,
      fields: ["MediaSources"],
    });

    const item = response.data.Items?.[0];
    if (!item) return null;

    const downloadInfo = getDownloadedAudioById(id);
    return toSong(item, downloadInfo, this.api, this.userId);
  }

  async getPlaylist(id: string): Promise<Playlist | null> {
    const response = await getItemsApi(this.api).getItems({
      ids: [id],
      userId: this.userId,
    });

    const item = response.data.Items?.[0];
    if (!item) return null;

    return toPlaylist(item, undefined, this.api);
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
    const response = await getItemsApi(this.api).getItems({
      userId: this.userId,
      parentId: albumId,
      includeItemTypes: ["Audio"],
      sortBy: ["ParentIndexNumber", "IndexNumber"],
      fields: ["MediaSources"],
    });

    // Enrich each track with download info
    return (response.data.Items || []).map((item) => {
      const downloadInfo = item.Id
        ? getDownloadedAudioById(item.Id)
        : undefined;
      return toSong(item, downloadInfo, this.api, this.userId);
      // ☝️ Some tracks will have source="offline", others "online"
    });
  }

  async getPlaylistSongs(playlistId: string): Promise<Song[]> {
    const response = await getItemsApi(this.api).getItems({
      userId: this.userId,
      parentId: playlistId,
      includeItemTypes: ["Audio"],
      fields: ["MediaSources"],
    });

    return (response.data.Items || []).map((item) => {
      const downloadInfo = item.Id
        ? getDownloadedAudioById(item.Id)
        : undefined;
      return toSong(item, downloadInfo, this.api, this.userId);
    });
  }

  // ========== User Data Mutations ==========

  async markFavorite(itemId: string): Promise<void> {
    await getUserLibraryApi(this.api).markFavoriteItem({
      userId: this.userId,
      itemId,
    });
  }

  async unmarkFavorite(itemId: string): Promise<void> {
    await getUserLibraryApi(this.api).unmarkFavoriteItem({
      userId: this.userId,
      itemId,
    });
  }

  async markPlayed(itemId: string, datePlayed?: Date): Promise<void> {
    await getPlaystateApi(this.api).markPlayedItem({
      userId: this.userId,
      itemId,
      datePlayed: datePlayed?.toISOString(),
    });
  }

  async markUnplayed(itemId: string): Promise<void> {
    await getPlaystateApi(this.api).markUnplayedItem({
      userId: this.userId,
      itemId,
    });
  }

  async updatePlaybackProgress(
    itemId: string,
    progress: PlaybackProgress,
  ): Promise<void> {
    await getPlaystateApi(this.api).reportPlaybackProgress({
      playbackProgressInfo: {
        ItemId: itemId,
        PositionTicks: progress.positionTicks,
        IsPaused: progress.isPaused,
        PlayMethod: "DirectPlay",
      },
    });
  }
}
