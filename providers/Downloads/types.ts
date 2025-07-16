import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client";

/**
 * Represents the data for downloaded trickplay files.
 */
export interface TrickPlayData {
  /** The local directory path where trickplay image sheets are stored. */
  path: string;
  /** The total size of all trickplay images in bytes. */
  size: number;
}

/**
 * Represents the user data for a downloaded item.
 */
interface UserData {
  subtitleStreamIndex: number;
  /** The last known audio stream index. */
  audioStreamIndex: number;
}

/** Represents a single downloaded media item with all necessary metadata for offline playback. */
export interface DownloadedItem {
  /** The full Jellyfin item object. */
  item: BaseItemDto;
  /** The local file path to the downloaded video file. The path is already prefixed with file:// */
  videoFilePath: string;
  /** The size of the downloaded video file in bytes. */
  videoFileSize: number;
  /** The data for the associated trickplay files. */
  trickPlayData?: TrickPlayData;
  /**
   * The specific media source that was downloaded.
   * Contains info on available audio/subtitle tracks within the file.
   */
  mediaSource: MediaSourceInfo;
  /** The intro segments for the item. */
  introSegments?: MediaTimeSegments[];
  /** The credit segments for the item. */
  creditSegments?: MediaTimeSegments[];
  /** The user data for the item. */
  userData?: UserData;
}

/**
 * Represents a downloaded Season, containing a map of its episodes.
 */
export interface DownloadedSeason {
  /** A map of episode numbers to their downloaded item data. */
  episodes: Record<number, DownloadedItem>;
}

/**
 * Represents a downloaded series, containing seasons and their episodes.
 */
export interface DownloadedSeries {
  /** The Jellyfin item object for the series itself. */
  seriesInfo: BaseItemDto;
  /** A map of season numbers to their downloaded season data. */
  seasons: Record<number, DownloadedSeason>;
}

/**
 * The main structure for all downloaded content stored locally.
 * This object is what will be saved to your local storage.
 */
export interface DownloadsDatabase {
  /** A map of movie IDs to their downloaded item data. */
  movies: Record<string, DownloadedItem>;
  /** A map of series IDs to their downloaded series data. */
  series: Record<string, DownloadedSeries>;
}
