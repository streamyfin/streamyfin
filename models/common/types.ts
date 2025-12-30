import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import type {
  MediaSegmentDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client/models";

/**
 * Media source state for content
 */
export enum MediaSource {
  Online = "online", // Streaming from server
  Offline = "offline", // Downloaded locally
  Cast = "cast", // Playing on remote device
}

/**
 * Cache type for downloaded content
 */
export enum CacheType {
  Permanent = "permanent", // User explicitly downloaded
  Temporary = "temporary", // Auto-cached for playback
  Favorite = "favorite", // Favorite items auto-download
}

/**
 * Media provider type (for plugin support)
 */
export interface MediaProvider {
  type: "jellyfin" | "youtube" | "twitch" | "other";
  id?: string; // Provider-specific ID (e.g., YouTube video ID)
}

/**
 * User-specific data that works both online and offline
 */
export interface UserMediaData {
  isFavorite?: boolean;
  playCount?: number;
  lastPlayedDate?: Date;
  playbackPositionTicks?: number;
  playedPercentage?: number;
  isPlayed?: boolean;
}

/**
 * Base download metadata for all media types
 */
export interface BaseDownloadInfo {
  filePath: string;
  fileSize: number;
  cacheType: CacheType;
  downloadedAt: Date;
  playCount: number;
  lastPlayedAt?: Date;
}

/**
 * Download info for containers (albums, series)
 */
export interface ContainerDownloadInfo extends BaseDownloadInfo {
  totalSize: number;
  downloadedChildCount: number;
  totalChildCount: number;
}

/**
 * Download info for video content (includes trickplay and segments)
 */
export interface VideoDownloadInfo extends BaseDownloadInfo {
  trickPlayData?: any; // TrickPlayData type
  introSegments?: MediaSegmentDto[];
  creditSegments?: MediaSegmentDto[];
}

/**
 * Base interface for all media entities (music, video, etc.)
 */
export interface BaseMediaEntity {
  id: string;
  name: string;
  source: MediaSource;
  serverId?: string;
  jellyfinItem: BaseItemDto; // Original Jellyfin data for compatibility
  lastModified?: Date;

  // Common metadata
  overview?: string;
  year?: number;
  genres?: string[];
  communityRating?: number;
  officialRating?: string;

  // Images
  artwork?: string; // Primary artwork URL or path
  backdropUrl?: string;
  logoUrl?: string;

  // User data
  userData?: UserMediaData;
}

/**
 * Playable media (songs, episodes, movies)
 */
export interface PlayableMedia extends BaseMediaEntity {
  duration?: number; // In seconds
  streamUrl?: string; // For online playback
  localPath?: string; // For offline playback

  // Media sources (quality options, etc.)
  mediaSources?: MediaSourceInfo[];
}

/**
 * Container media (albums, series, playlists)
 */
export interface MediaContainer<TChild> extends BaseMediaEntity {
  childCount?: number;
  children?: TChild[];
}

/**
 * Person (actor, director, artist, etc.)
 */
export interface Person {
  id?: string;
  name: string;
  role?: string;
  type?: string;
  primaryImageUrl?: string;
}
