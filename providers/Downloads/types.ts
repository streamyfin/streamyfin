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
  id: string;
  inputUrl: string;
  item: BaseItemDto;
  itemId: string;
  deviceId: string;
  progress: number;
  status:
    | "downloading"
    | "paused"
    | "error"
    | "pending"
    | "completed"
    | "queued";
  timestamp: Date;
  mediaSource: MediaSourceInfo;
  maxBitrate: Bitrate;
  bytesDownloaded?: number;
  lastProgressUpdateTime?: Date;
  speed?: number;
  estimatedTotalSizeBytes?: number;
};
