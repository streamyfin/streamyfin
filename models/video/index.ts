// Video domain models

export type { ContainerDownloadInfo, VideoDownloadInfo } from "../common/types";
// Adapters
export {
  toEpisode,
  toMovie,
  toProgram,
  toSeason,
  toSeries,
} from "./adapters";
// Type guards
export {
  isEpisode,
  isMovie,
  isProgram,
  isSeason,
  isSeries,
  isVideoContainer,
  isVideoContent,
} from "./guards";
export type { Episode, Movie, Program, Season, Series } from "./types";
