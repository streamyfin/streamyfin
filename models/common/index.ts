// Common types used across all media

// Common adapters
export {
  detectMediaProvider,
  detectMediaSource,
  getArtworkUrl,
  getImageUrl,
  getStreamUrl,
  mapUserData,
  toBaseMediaEntity,
} from "./adapters";
export type {
  BaseDownloadInfo,
  BaseMediaEntity,
  ContainerDownloadInfo,
  MediaContainer,
  MediaProvider,
  Person,
  PlayableMedia,
  UserMediaData,
  VideoDownloadInfo,
} from "./types";
export { CacheType, MediaSource } from "./types";
