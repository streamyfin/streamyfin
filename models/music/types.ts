import type {
  BaseDownloadInfo,
  ContainerDownloadInfo,
  MediaContainer,
  PlayableMedia,
} from "../common/types";

// Re-export common types for backward compatibility
export { CacheType, MediaSource } from "../common/types";

/**
 * Download metadata for individual tracks
 */
export interface SongDownloadInfo extends BaseDownloadInfo {
  // All fields inherited from BaseDownloadInfo
}

/**
 * Download metadata for albums
 */
export interface AlbumDownloadInfo extends ContainerDownloadInfo {
  // Alias for compatibility
  downloadedTrackCount: number;
  totalTrackCount: number;
}

/**
 * Download metadata for artists
 */
export interface ArtistDownloadInfo extends ContainerDownloadInfo {
  // Alias for compatibility
  downloadedAlbumCount: number;
  totalAlbumCount: number;
}

/**
 * Download metadata for playlists
 */
export interface PlaylistDownloadInfo extends ContainerDownloadInfo {
  // Alias for compatibility
  downloadedTrackCount: number;
  totalTrackCount: number;
}

/**
 * Individual music track/song
 */
export interface Song extends PlayableMedia {
  title: string;
  artistName?: string;
  artistId?: string;
  albumName?: string;
  albumId?: string;
  albumArtist?: string;
  trackNumber?: number;
  discNumber?: number;

  // Download metadata (if offline)
  downloadInfo?: SongDownloadInfo;
}

/**
 * Music album
 */
export interface Album extends MediaContainer<Song> {
  artistName?: string;
  artistId?: string;
  trackCount?: number;
  runTimeTicks?: number;

  // Download metadata
  downloadInfo?: AlbumDownloadInfo;
}

/**
 * Music artist
 */
export interface Artist extends MediaContainer<Album> {
  albumCount?: number;
  songCount?: number;

  // Populated when needed
  topTracks?: Song[];

  // Download metadata
  downloadInfo?: ArtistDownloadInfo;
}

/**
 * Music playlist
 */
export interface Playlist extends MediaContainer<Song> {
  description?: string;
  owner?: string;
  trackCount?: number;

  // Download metadata (if applicable)
  downloadInfo?: PlaylistDownloadInfo;
}
