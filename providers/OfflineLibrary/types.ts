import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";

/**
 * Offline mutation types that can be queued when offline
 */
export type OfflineMutationType =
  | "FAVORITE"
  | "UNFAVORITE"
  | "MARK_PLAYED"
  | "MARK_UNPLAYED"
  | "PLAYBACK_PROGRESS";

/**
 * Represents a mutation that was performed offline and needs to be synced
 */
export interface OfflineMutation {
  id: string; // UUID for deduplication
  type: OfflineMutationType;
  itemId: string;
  timestamp: string; // ISO string
  payload: Record<string, any>; // Type-specific data
  retryCount: number;
  status: "pending" | "processing" | "failed" | "success";
  lastError?: string;
}

/**
 * Mutation queue stored in MMKV
 */
export interface MutationQueue {
  mutations: OfflineMutation[];
  lastSyncAttempt?: string;
  lastSuccessfulSync?: string;
}

/**
 * Filters for querying local library
 */
export interface LibraryFilters {
  type?:
    | "Movie"
    | "Series"
    | "Episode"
    | "Season"
    | "Audio"
    | "MusicAlbum"
    | "MusicArtist";
  searchTerm?: string;
  sortBy?: "Name" | "DateCreated" | "PremiereDate" | "IndexNumber";
  sortOrder?: "Ascending" | "Descending";
  limit?: number;
  startIndex?: number;
}

/**
 * Result of a sync operation
 */
export interface SyncResult {
  success: OfflineMutation[];
  failed: OfflineMutation[];
  skipped: OfflineMutation[];
}

/**
 * Conflict resolution action
 */
export type ConflictAction = "APPLY_LOCAL" | "APPLY_SERVER";

/**
 * Result of conflict resolution
 */
export interface ConflictResolution {
  action: ConflictAction;
  mutation?: OfflineMutation;
  serverData?: any;
}

/**
 * Library query result with pagination
 */
export interface LibraryQueryResult {
  items: BaseItemDto[];
  totalCount: number;
  startIndex: number;
}

// Re-export music domain types for convenience
export type {
  Album,
  AlbumDownloadInfo,
  Artist,
  ArtistDownloadInfo,
  Playlist,
  PlaylistDownloadInfo,
  Song,
  SongDownloadInfo,
} from "@/models/music/types";
export { CacheType, MediaSource } from "@/models/music/types";
