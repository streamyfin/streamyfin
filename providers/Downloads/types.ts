import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client/models";
import { Bitrate } from "@/components/BitrateSelector";

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

/** Represents a segment of time in a media item, used for intro/credit skipping. */
export interface MediaTimeSegment {
  startTime: number;
  endTime: number;
  text: string;
}

export interface Segment {
  startTime: number;
  endTime: number;
  text: string;
}

/** Represents a single downloaded media item with all necessary metadata for offline playback. */
export interface DownloadedItem {
  /** The Jellyfin item DTO. */
  item: BaseItemDto;
  /** The media source information. */
  mediaSource: MediaSourceInfo;
  /** The local file path of the downloaded video. */
  videoFilePath: string;
  /** The size of the video file in bytes. */
  videoFileSize: number;
  /** The local file path of the downloaded trickplay images. */
  trickPlayData?: TrickPlayData;
  /** The intro segments for the item. */
  introSegments?: MediaTimeSegment[];
  /** The credit segments for the item. */
  creditSegments?: MediaTimeSegment[];
  /** The user data for the item. */
  userData: UserData;
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
  /** The Jellyfin item DTO for the series. */
  seriesInfo: BaseItemDto;
  /** A map of season numbers to their downloaded season data. */
  seasons: Record<
    number,
    {
      /** A map of episode numbers to their downloaded episode data. */
      episodes: Record<number, DownloadedItem>;
    }
  >;
}

/**
 * The main structure for all downloaded content stored locally.
 * This object is what will be saved to your local storage.
 */
export interface DownloadsDatabase {
  /** A map of movie IDs to their downloaded movie data. */
  movies: Record<string, DownloadedItem>;
  /** A map of series IDs to their downloaded series data. */
  series: Record<string, DownloadedSeries>;
}

/**
 * Represents the status of a download job.
 */
export type JobStatus = {
  /** Unique identifier for the download job (also the {@link itemId}) */
  id: string;
  /** The input URL for the media to be downloaded (passed in when first downloading) */
  inputUrl: string;
  /** The Jellyfin {@link BaseItemDto} associated with this job */
  item: BaseItemDto;
  /** The ID of the item being downloaded */
  itemId: string;
  /** The device ID where the download is occurring */
  deviceId: string;
  /** Download progress as a percentage (0-100) */
  progress: number;
  /** Current status of the download job */
  status:
    | "downloading" // The job is actively downloading
    | "paused" // The job is paused
    | "error" // The job encountered an error
    | "pending" // The job is waiting to start
    | "completed" // The job has finished downloading
    | "queued"; // The job is queued to start
  /** Timestamp of when the job was created or last updated */
  timestamp: Date;
  /** The {@link MediaSourceInfo} for the download */
  mediaSource: MediaSourceInfo;
  /** The bit rate we are downloading the media file atq */
  maxBitrate: Bitrate;
  /** The number of bytes downloaded so far (optional) */
  bytesDownloaded?: number;
  /** The last time the download progress was updated (optional) */
  lastProgressUpdateTime?: Date;
  /** Current download speed in bytes per second (optional) */
  speed?: number;
  /** Estimated total size of the download in bytes (optional) this is used when we
   * download transcoded content because we don't know the size of the file until it's downloaded */
  estimatedTotalSizeBytes?: number;
  /** Timestamp when the download was paused (optional) */
  pausedAt?: Date;
  /** Progress percentage when download was paused (optional) */
  pausedProgress?: number;
  /** Bytes downloaded when download was paused (optional) */
  pausedBytes?: number;
  /** Bytes downloaded in the current session (since last resume). Used for session-only speed calculation. */
  lastSessionBytes?: number;
  /** Timestamp when the session-only bytes were last updated. */
  lastSessionUpdateTime?: Date;
};
