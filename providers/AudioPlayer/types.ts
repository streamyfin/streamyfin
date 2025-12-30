import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";

// TEMPORARY: Track interface stub since react-native-track-player is disabled
interface Track {
  url: string;
  [key: string]: unknown;
}

/**
 * Represents a playable audio track with Jellyfin metadata.
 * Extends react-native-track-player's Track interface.
 */
export interface AudioTrack extends Track {
  /** Unique identifier (Jellyfin item ID) */
  id: string;
  /** The Jellyfin item DTO */
  jellyfinItem: BaseItemDto;
  /** Track title */
  title: string;
  /** Artist name */
  artist?: string;
  /** Album name */
  album?: string;
  /** Album artist name */
  albumArtist?: string;
  /** Artwork URL */
  artwork?: string;
  /** Duration in seconds */
  duration?: number;
  /** Whether this track is available offline */
  isOffline: boolean;
  /** Local file path if downloaded */
  localPath?: string;
  /** Track number in album */
  trackNumber?: number;
  /** Disc number */
  discNumber?: number;
  /** Year released */
  year?: number;
  /** Genre */
  genre?: string;
}

/**
 * Repeat mode for audio playback
 * - off: No repeat
 * - one: Repeat current track
 * - all: Repeat entire queue
 * - album: Repeat current album only
 */
export type RepeatMode = "off" | "one" | "all" | "album";

/**
 * Audio player state
 */
export interface AudioPlayerState {
  /** Currently playing track */
  currentTrack: AudioTrack | null;
  /** Current playback queue */
  queue: AudioTrack[];
  /** Current index in the queue */
  queueIndex: number;
  /** Whether audio is currently playing */
  isPlaying: boolean;
  /** Current playback position in seconds */
  position: number;
  /** Total duration in seconds */
  duration: number;
  /** Buffered position in seconds */
  bufferedPosition: number;
  /** Whether the player is buffering */
  isBuffering: boolean;
  /** Current repeat mode */
  repeatMode: RepeatMode;
  /** Whether shuffle is enabled */
  shuffleEnabled: boolean;
  /** Whether the player is ready */
  isReady: boolean;
  /** Active remote Jellyfin session ID (null if playing locally) */
  remoteSessionId: string | null;
}

/**
 * Buffer mode configuration
 */
export type AudioBufferMode = "tracks" | "size";

/**
 * Audio-specific settings
 */
export interface AudioSettings {
  /** Number of tracks to buffer ahead (when bufferMode is 'tracks') */
  audioBufferTracks: number;
  /** Size in MB to buffer ahead (when bufferMode is 'size') */
  audioBufferSizeMB: number;
  /** Buffer mode: by track count or by size */
  audioBufferMode: AudioBufferMode;
  /** Maximum size for favorite songs cache in MB */
  favoriteSongCacheSizeMB: number;
  /** Maximum size for temporary song cache in MB */
  temporarySongCacheSizeMB: number;
  /** Maximum size for entire music library downloads in MB */
  maxMusicLibrarySizeMB: number;
  /** Number of plays before auto-marking as favorite */
  autoFavoritePlayCount: number;
  /** Skip forward interval in seconds */
  audioSkipForward: number;
  /** Skip backward interval in seconds */
  audioSkipBackward: number;
  /** Whether to enable gapless playback */
  gaplessPlayback: boolean;
}

/**
 * Default audio settings values
 */
export const defaultAudioSettings: AudioSettings = {
  audioBufferTracks: 5,
  audioBufferSizeMB: 50,
  audioBufferMode: "tracks",
  favoriteSongCacheSizeMB: 500,
  temporarySongCacheSizeMB: 200,
  maxMusicLibrarySizeMB: 2000,
  autoFavoritePlayCount: 5,
  audioSkipForward: 15,
  audioSkipBackward: 15,
  gaplessPlayback: true,
};

/**
 * Cache type for downloaded audio items
 */
export type AudioCacheType = "permanent" | "temporary" | "favorite";

/**
 * Represents a downloaded audio item
 */
export interface DownloadedAudioItem {
  /** The Jellyfin item DTO */
  item: BaseItemDto;
  /** Local file path for the audio file */
  audioFilePath: string;
  /** Size of the audio file in bytes */
  audioFileSize: number;
  /** The audio filename (for reconstruction) */
  audioFileName?: string;
  /** Type of cache this item belongs to */
  cacheType: AudioCacheType;
  /** Number of times this track has been played */
  playCount: number;
  /** Last played timestamp (ISO string) */
  lastPlayedDate?: string;
  /** Whether this was auto-favorited */
  autoFavorited?: boolean;
}

/**
 * Represents a downloaded album with all its tracks
 */
export interface DownloadedAlbum {
  /** The album's Jellyfin item DTO */
  albumInfo: BaseItemDto;
  /** Map of track IDs to downloaded audio items */
  tracks: Record<string, DownloadedAudioItem>;
  /** Total size of all tracks in bytes */
  totalSize: number;
  /** Download timestamp */
  downloadedAt: string;
}

/**
 * Represents a downloaded artist with all their albums
 */
export interface DownloadedArtist {
  /** The artist's Jellyfin item DTO */
  artistInfo: BaseItemDto;
  /** Map of album IDs to downloaded albums */
  albums: Record<string, DownloadedAlbum>;
  /** Total size of all albums in bytes */
  totalSize: number;
  /** Download timestamp */
  downloadedAt: string;
}

/**
 * Audio downloads database structure
 */
export interface AudioDownloadsDatabase {
  /** Map of album IDs to downloaded albums */
  albums: Record<string, DownloadedAlbum>;
  /** Map of artist IDs to downloaded artists */
  artists: Record<string, DownloadedArtist>;
  /** Map of individual track IDs to downloaded items (for singles/playlists) */
  tracks: Record<string, DownloadedAudioItem>;
}

/**
 * Empty audio downloads database
 */
export const emptyAudioDownloadsDatabase: AudioDownloadsDatabase = {
  albums: {},
  artists: {},
  tracks: {},
};

/**
 * Play statistics for a track
 */
export interface TrackPlayStats {
  /** Jellyfin item ID */
  itemId: string;
  /** Number of times played to completion */
  playCount: number;
  /** Last played timestamp (ISO string) */
  lastPlayedDate: string;
  /** Whether this was auto-favorited based on play count */
  autoFavorited: boolean;
  /** Total time listened in seconds */
  totalListenTime: number;
}

/**
 * Audio download job status
 */
export interface AudioJobStatus {
  /** Unique identifier for the download job */
  id: string;
  /** The Jellyfin item being downloaded */
  item: BaseItemDto;
  /** Download progress as a percentage (0-100) */
  progress: number;
  /** Current status of the download */
  status: "queued" | "downloading" | "completed" | "error" | "cancelled";
  /** Error message if status is 'error' */
  errorMessage?: string;
  /** Bytes downloaded so far */
  bytesDownloaded: number;
  /** Total bytes to download */
  totalBytes: number;
  /** Download speed in bytes per second */
  speed?: number;
  /** Type of download: single track, album, or artist */
  downloadType: "track" | "album" | "artist";
  /** Parent album ID if downloading a track */
  parentAlbumId?: string;
  /** Parent artist ID if downloading an album or track */
  parentArtistId?: string;
  /** Cache type for this download */
  cacheType: AudioCacheType;
  /** Timestamp when the job was created */
  createdAt: string;
}
