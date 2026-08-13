// Web (desktop) variant of the native module barrel.
//
// Every module behind this barrel is an Expo native module with iOS/Android
// source only. On desktop the video players collapse onto an HTML5 <video>
// surface (modules/mpv-player/index.web.tsx), background downloading is
// unavailable, and the tvOS / Android-TV integrations are meaningless.
//
// The submodule paths below name `index.web` explicitly. A bare `./mpv-player`
// would resolve to the native `index.ts`: Metro's platform-extension lookup
// does not kick in for these directory imports, which is the same reason
// metro.config.js has to redirect `@/modules/*` by hand.

export type {
  ActiveDownload,
  DownloadCompleteEvent,
  DownloadErrorEvent,
  DownloadProgressEvent,
  DownloadStartedEvent,
} from "./background-downloader/index.web";
export { default as BackgroundDownloader } from "./background-downloader/index.web";
export { ExoPlayerView } from "./exoplayer-player/index.web";
export type { GlassPosterViewProps } from "./glass-poster/index.web";
export {
  GlassPosterView,
  isGlassEffectAvailable,
} from "./glass-poster/index.web";
export { MpvPlayerView } from "./mpv-player/index.web";
export type {
  AudioTrack as MpvAudioTrack,
  MpvPlayerViewProps,
  MpvPlayerViewRef,
  OnErrorEventPayload as MpvOnErrorEventPayload,
  OnLoadEventPayload as MpvOnLoadEventPayload,
  OnPlaybackStateChangePayload as MpvOnPlaybackStateChangePayload,
  OnProgressEventPayload as MpvOnProgressEventPayload,
  OnTracksReadyEventPayload as MpvOnTracksReadyEventPayload,
  SubtitleTrack as MpvSubtitleTrack,
  VideoSource as MpvVideoSource,
} from "./mpv-player/src/MpvPlayer.types";

// tvOS Top Shelf — no desktop equivalent.
export type {
  TopShelfCacheItem,
  TopShelfCachePayload,
  TopShelfCacheSection,
} from "./top-shelf-cache/src";
export const clearTopShelfCache = async (): Promise<void> => undefined;
export const writeTopShelfCache = async (_payload?: unknown): Promise<void> =>
  undefined;

// Android TV home-screen recommendations — no desktop equivalent.
export const clearTvRecommendations = async (): Promise<void> => undefined;
export const refreshTvRecommendations = async (): Promise<void> => undefined;
export const syncTvRecommendations = async (
  _payload?: unknown,
): Promise<void> => undefined;
