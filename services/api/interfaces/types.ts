/**
 * Common filter base for all queries
 */
export interface BaseFilters {
  searchTerm?: string;
  sortBy?: string[];
  sortOrder?: "Ascending" | "Descending";
  limit?: number;
  startIndex?: number;
  genres?: string[];
  years?: number[];
  isFavorite?: boolean;
}

/**
 * Artist-specific filters
 */
export interface ArtistFilters extends BaseFilters {
  libraryId?: string;
}

/**
 * Album-specific filters
 */
export interface AlbumFilters extends BaseFilters {
  libraryId?: string;
  artistId?: string;
}

/**
 * Song/track-specific filters
 */
export interface SongFilters extends BaseFilters {
  libraryId?: string;
  artistId?: string;
  albumId?: string;
  playlistId?: string;
}

/**
 * Playlist-specific filters
 */
export interface PlaylistFilters extends BaseFilters {
  libraryId?: string;
}

/**
 * Movie-specific filters
 */
export interface MovieFilters extends BaseFilters {
  libraryId?: string;
  studios?: string[];
}

/**
 * Series-specific filters
 */
export interface SeriesFilters extends BaseFilters {
  libraryId?: string;
  status?: "Continuing" | "Ended";
}

/**
 * Episode-specific filters
 */
export interface EpisodeFilters extends BaseFilters {
  seriesId?: string;
  seasonId?: string;
  seasonNumber?: number;
}

/**
 * Paginated result wrapper
 */
export interface PaginatedResult<T> {
  items: T[];
  totalCount: number;
  startIndex: number;
}

/**
 * Playback progress data
 */
export interface PlaybackProgress {
  positionTicks: number;
  isPaused: boolean;
}
