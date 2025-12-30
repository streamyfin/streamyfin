import type {
  BaseMediaEntity,
  ContainerDownloadInfo,
  MediaContainer,
  Person,
  PlayableMedia,
  VideoDownloadInfo,
} from "../common/types";

/**
 * Individual movie
 */
export interface Movie extends PlayableMedia {
  // Movie-specific metadata
  studios?: string[];
  directors?: Person[];
  actors?: Person[];
  writers?: Person[];
  producers?: Person[];
  taglines?: string[];
  originalTitle?: string;

  // Download info
  downloadInfo?: VideoDownloadInfo;
}

/**
 * Individual TV episode
 */
export interface Episode extends PlayableMedia {
  // Episode-specific
  seriesId?: string;
  seriesName?: string;
  seasonId?: string;
  seasonNumber?: number;
  episodeNumber?: number;

  // Navigation
  nextEpisodeId?: string;
  previousEpisodeId?: string;

  // Download info
  downloadInfo?: VideoDownloadInfo;
}

/**
 * TV season (container of episodes)
 */
export interface Season extends MediaContainer<Episode> {
  seriesId?: string;
  seriesName?: string;
  seasonNumber?: number;
  episodeCount?: number;

  // Download info
  downloadInfo?: ContainerDownloadInfo;
}

/**
 * TV series (container of seasons)
 */
export interface Series extends MediaContainer<Season> {
  seasonCount?: number;
  episodeCount?: number;
  status?: string; // "Continuing" | "Ended"
  airDays?: string[];
  airTime?: string;
  endDate?: Date;

  // Download info
  downloadInfo?: ContainerDownloadInfo;
}

/**
 * Live TV program/recording
 */
export interface Program extends PlayableMedia {
  channelId?: string;
  channelName?: string;
  startDate?: Date;
  endDate?: Date;
  isLive?: boolean;
  isRecording?: boolean;

  // Download info
  downloadInfo?: VideoDownloadInfo;
}

// Re-export common types for convenience
export type {
  VideoDownloadInfo,
  ContainerDownloadInfo,
  Person,
  BaseMediaEntity,
  PlayableMedia,
  MediaContainer,
};
