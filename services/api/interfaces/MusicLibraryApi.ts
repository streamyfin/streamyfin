import type { Album, Artist, Playlist, Song } from "@/models/music/types";
import type { BaseMediaApi } from "./BaseMediaApi";
import type {
  AlbumFilters,
  ArtistFilters,
  PaginatedResult,
  PlaylistFilters,
  SongFilters,
} from "./types";

/**
 * Music library API interface
 * Provides methods for querying and manipulating music content
 */
export interface MusicLibraryApi extends BaseMediaApi {
  // ========== Collection Queries ==========

  /**
   * Get a paginated list of artists
   */
  getArtists(filters?: ArtistFilters): Promise<PaginatedResult<Artist>>;

  /**
   * Get a paginated list of albums
   */
  getAlbums(filters?: AlbumFilters): Promise<PaginatedResult<Album>>;

  /**
   * Get a paginated list of songs
   */
  getSongs(filters?: SongFilters): Promise<PaginatedResult<Song>>;

  /**
   * Get a paginated list of playlists
   */
  getPlaylists(filters?: PlaylistFilters): Promise<PaginatedResult<Playlist>>;

  // ========== Single Item Queries ==========

  /**
   * Get a single artist by ID
   */
  getArtist(id: string): Promise<Artist | null>;

  /**
   * Get a single album by ID
   */
  getAlbum(id: string): Promise<Album | null>;

  /**
   * Get a single song by ID
   */
  getSong(id: string): Promise<Song | null>;

  /**
   * Get a single playlist by ID
   */
  getPlaylist(id: string): Promise<Playlist | null>;

  // ========== Relationship Queries ==========

  /**
   * Get all albums for a specific artist
   */
  getArtistAlbums(artistId: string, filters?: AlbumFilters): Promise<Album[]>;

  /**
   * Get all songs in an album
   */
  getAlbumSongs(albumId: string): Promise<Song[]>;

  /**
   * Get all songs in a playlist
   */
  getPlaylistSongs(playlistId: string): Promise<Song[]>;

  /**
   * Get top/popular tracks for an artist (if available)
   */
  getArtistTopTracks?(artistId: string, limit?: number): Promise<Song[]>;
}
